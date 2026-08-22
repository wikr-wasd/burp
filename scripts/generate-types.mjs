#!/usr/bin/env node
/**
 * Genererar TypeScript-typer ur schemat.
 *
 * ── Varför ett skript och inte en rad i package.json ────────────────────────
 *
 * Raden var tidigare:
 *
 *     supabase gen types typescript --project-id $SUPABASE_PROJECT_ID … > fil
 *
 * och den hade tre fel som alla tre bet 2026-08-22.
 *
 *   1. `--project-id` pekar på ett MOLNPROJEKT. Supabase i molnet är ännu inte
 *      uppsatt (se docs/TODO.md), så variabeln är tom och kommandot kan inte
 *      lyckas på den här maskinen — trots att hela schemat ligger i en lokal
 *      stack som svarar.
 *
 *   2. `>` skapar filen INNAN kommandot kört. Ett misslyckat anrop skriver
 *      alltså sitt felmeddelande rakt in i `database.types.ts`, som därmed blir
 *      en `.ts`-fil full av JSON. Typkontrollen faller sedan på fyra rader som
 *      inte säger ett ord om vad som egentligen hände.
 *
 *   3. Utdata skrevs till en fil som ingen importerar. Ett kommando som
 *      producerar något ingen läser är ett skal — se CLAUDE.md.
 *
 * Punkt 1 och 2 är rättade här. Punkt 3 står kvar som en rad i TODO-listan:
 * att koppla `Database` till `createClient<Database>()` är den riktiga vinsten,
 * och den ändringen rör varje fråga i produkten.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TARGET = "apps/web/src/lib/supabase/database.types.ts";

/** `--local` som standard. Molnet kräver ett projekt-id som ännu inte finns. */
const remote = process.argv.includes("--remote");

/**
 * `--check` skriver ingenting — den svarar bara på om filen är aktuell.
 *
 * Risken filen bär är asymmetrisk. En NY kolumn som glöms bort märks direkt:
 * koden som använder den kompilerar inte. En BORTTAGEN eller omdöpt kolumn
 * märks inte alls — typerna påstår att den finns, bygget går igenom, och felet
 * dyker upp i drift.
 *
 * Det är precis den sortens fel `smoke.sh` finns för, och flaggan låter den
 * ställa frågan utan att röra repot.
 */
const checkOnly = process.argv.includes("--check");
const projectId = process.env.SUPABASE_PROJECT_ID;

if (remote && !projectId) {
  console.error(
    "SUPABASE_PROJECT_ID saknas. Sätt den, eller kör utan --remote mot den lokala stacken.",
  );
  process.exit(1);
}

/*
 * Projekt-id:t kontrolleras innan det sätts ihop till en kommandorad.
 *
 * Kommandot körs genom ett skal — `npx` är ett .cmd-skript på Windows och går
 * inte att starta utan ett — och allt som hamnar i en skalrad utan kontroll är
 * en injektionsyta. Supabase egna projekt-id är tjugo gemener; en sträng som
 * inte ser ut så avvisas hellre än escapas.
 */
if (remote && !/^[a-z]{20}$/.test(projectId)) {
  console.error(`SUPABASE_PROJECT_ID ser inte ut som ett projekt-id: "${projectId}"`);
  process.exit(1);
}

const command = [
  "npx supabase gen types typescript --schema public",
  remote ? `--project-id ${projectId}` : "--local",
].join(" ");

const result = spawnSync(command, { encoding: "utf8", shell: true });

if (result.status !== 0) {
  console.error(result.stderr?.trim() || "supabase gen types misslyckades.");
  console.error(
    remote
      ? "Kontrollera projekt-id och inloggning."
      : "Kör `npx supabase start` först — den lokala stacken måste svara.",
  );
  process.exit(1);
}

const output = result.stdout ?? "";

/*
 * Kontrollera att det ser ut som TypeScript innan filen skrivs.
 *
 * Supabase CLI svarar med JSON när något gått fel och avslutar ändå med noll i
 * vissa lägen. Utan den här raden hamnar felet i filen igen — samma fälla, ny
 * väg in.
 */
if (!output.includes("export type Database")) {
  console.error("Utdata såg inte ut som typer. Filen lämnades orörd.");
  console.error(output.slice(0, 300));
  process.exit(1);
}

if (checkOnly) {
  if (!existsSync(TARGET)) {
    console.error(`${TARGET} saknas. Kör: npm run db:types`);
    process.exit(1);
  }

  /*
   * Radslut normaliseras före jämförelsen.
   *
   * Git checkar ut CRLF på Windows och skriver LF i repot. En jämförelse som
   * faller på det hade rapporterat ett schemafel som inte finns — och en
   * kontroll som ropar varg är värre än ingen kontroll.
   */
  const normalise = (text) => text.replace(/\r\n/g, "\n").trimEnd();

  if (normalise(readFileSync(TARGET, "utf8")) !== normalise(output)) {
    console.error(`${TARGET} är inte i takt med schemat. Kör: npm run db:types`);
    process.exit(1);
  }

  console.log(`${TARGET} är i takt med schemat.`);
  process.exit(0);
}

// Via en temporär fil: målet skrivs över först när vi vet att innehållet håller.
const dir = mkdtempSync(join(tmpdir(), "burp-types-"));
const staged = join(dir, "database.types.ts");
writeFileSync(staged, output, "utf8");
writeFileSync(TARGET, readFileSync(staged, "utf8"), "utf8");
rmSync(dir, { recursive: true, force: true });

const lines = output.split("\n").length;
console.log(`${TARGET} — ${lines} rader ur ${remote ? "molnet" : "den lokala stacken"}.`);
