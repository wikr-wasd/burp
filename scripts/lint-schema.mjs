#!/usr/bin/env node
/**
 * `supabase db lint`, men bara på Burps egna funktioner.
 *
 * `docs/DEPLOYMENT.md` har haft "kör `npx supabase db lint`" som en punkt före
 * produktion sedan länge. Kommandot kördes 2026-08-28 för första gången, och
 * resultatet var oanvändbart: sjutton träffar, varav **noll** i Burps kod.
 * Allt kom ur PostGIS egna plpgsql-funktioner — `st_findextent`,
 * `populate_geometry_columns`, `addgeometrycolumn`, `lockrow`, `addauth`,
 * `postgis_full_version`, `st_letters`.
 *
 * Flera av dem har `"level":"error"`. `lockrow` refererar en tabell
 * (`authorization_table`) som bara finns om man slagit på PostGIS långa
 * transaktioner; `postgis_full_version` anropar `postgis_gdal_version()`, som
 * inte finns utan raster-tillägget. Det är helt normalt i en PostGIS-
 * installation och ingenting vi vare sig kan eller ska rätta — men den som
 * kör kommandot före en driftsättning ser en vägg av `error` och drar den enda
 * rimliga slutsatsen: att schemat är trasigt.
 *
 * En kontroll som alltid larmar är ingen kontroll. Den lärs bort första gången
 * någon har bråttom, och då är den värre än ingen alls — för nästa gång den
 * larmar av ett riktigt skäl blir den ignorerad av vana.
 *
 * ── Vad "vår egen" betyder ─────────────────────────────────────────────────
 *
 * En funktion som skapas av en fil i `supabase/migrations/`. Namnen läses ur
 * migrationerna och inte ur databasen, av samma skäl som `validate-migrations`
 * gör det: repot är sanningen om vad vi äger, och en funktion vi lagt till
 * står i en migration den dag den skapas. Ett uppslag mot `pg_depend` hade
 * varit exaktare men hade också krävt en databas för att veta vad vi skrivit.
 *
 * ── Utfall ─────────────────────────────────────────────────────────────────
 *
 * Exitkod 1 om någon av VÅRA funktioner har en anmärkning på `error`-nivå.
 * Varningar skrivs ut men fäller inte — plpgsql_check varnar bland annat för
 * oanvända variabler, och den sortens städning ska inte stoppa en deploy.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS = "supabase/migrations";

/**
 * Namnen på funktioner som skapas någonstans i migrationerna.
 *
 * Matchar `create function`, `create or replace function` och valfritt
 * `public.`-prefix. Returnerar namnen utan schema — jämförelsen sker mot
 * `public.<namn>` som linten rapporterar.
 */
function ownFunctions() {
  const names = new Set();
  const pattern = /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?"?([a-z0-9_]+)"?\s*\(/gi;

  for (const file of readdirSync(MIGRATIONS).filter((name) => name.endsWith(".sql"))) {
    const sql = readFileSync(join(MIGRATIONS, file), "utf8");
    for (const match of sql.matchAll(pattern)) names.add(match[1].toLowerCase());
  }

  return names;
}

/**
 * Kör linten och plockar ut JSON-objektet ur utdatan.
 *
 * CLI:t skriver "Connecting to local database…" och liknande före resultatet,
 * så utdatan är inte ren JSON. Vi letar upp den första rad som börjar med `{`
 * och låter bli att gissa på resten.
 */
function runLint() {
  let stdout;

  try {
    stdout = execFileSync(
      "npx",
      ["supabase", "db", "lint", "--schema", "public", "--level", "warning", "--output-format", "json"],
      { encoding: "utf8", shell: process.platform === "win32" },
    );
  } catch (error) {
    // Linten avslutar med skild från noll när den hittar något. Utdatan finns
    // ändå, och det är den vi vill läsa — inte exitkoden, som räknar PostGIS
    // träffar också.
    stdout = error.stdout ?? "";
    if (!stdout) {
      console.error("Linten gick inte att köra. Är den lokala stacken igång?");
      console.error(String(error.stderr ?? error.message).trim());
      process.exit(2);
    }
  }

  const line = stdout.split(/\r?\n/).find((entry) => entry.trimStart().startsWith("{"));
  if (!line) {
    console.error("Hittade ingen JSON i lintens utdata.");
    process.exit(2);
  }

  return JSON.parse(line).results ?? [];
}

const own = ownFunctions();
const results = runLint();

/*
 * Samma funktion kan komma tillbaka flera gånger — plpgsql_check rapporterar
 * per överlagring, och PostGIS har flera av samma namn. Anmärkningarna slås
 * ihop per funktionsnamn så att utskriften läses som en lista över funktioner
 * och inte som en lista över körningar.
 */
const mine = new Map();
let skipped = 0;

for (const entry of results) {
  const name = String(entry.function ?? "").replace(/^public\./, "").toLowerCase();

  if (!own.has(name)) {
    skipped += 1;
    continue;
  }

  const existing = mine.get(name) ?? [];
  mine.set(name, [...existing, ...(entry.issues ?? [])]);
}

let errors = 0;

for (const [name, issues] of [...mine.entries()].sort()) {
  console.log(`\n  public.${name}`);

  for (const issue of issues) {
    const level = String(issue.level ?? "").split(" ")[0];
    if (level === "error") errors += 1;

    const where = issue.statement?.lineNumber ? ` (rad ${issue.statement.lineNumber})` : "";
    console.log(`    ${level.padEnd(8)} ${issue.message}${where}`);
  }
}

const checked = own.size;

if (mine.size === 0) {
  console.log(
    `\n${checked} egna funktioner kontrollerade — inga anmärkningar. ` +
      `${skipped} träffar i PostGIS egna funktioner ignorerade.`,
  );
  process.exit(0);
}

console.log(
  `\n${checked} egna funktioner kontrollerade, ${mine.size} med anmärkning ` +
    `(${errors} på error-nivå). ${skipped} träffar i PostGIS egna funktioner ignorerade.`,
);

process.exit(errors > 0 ? 1 : 0);
