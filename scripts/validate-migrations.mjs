#!/usr/bin/env node
/**
 * Kör migrationerna genom PostgreSQL:s EGEN parser (libpg-query, byggd på
 * PG17 — samma version som databasen).
 *
 * Ett syntaxfel i en migration upptäcks annars först när den körs mot en
 * riktig databas, och då har halva migrationen redan hunnit köras. Det här
 * fångar felen på en sekund i stället.
 *
 * Vad det INTE fångar:
 *
 *   1. Semantik — att en kolumn saknas, att en FK pekar fel eller att en
 *      RLS-policy släpper igenom för mycket.
 *   2. **Innehållet i plpgsql-funktioner.** Kroppen mellan $$ ... $$ är en
 *      strängliteral för SQL-parsern och granskas inte alls. Just där bodde
 *      båda felen som hittades manuellt i migration 0010 (ett CASE som blandade
 *      text[] och order_status[], och en DELETE-trigger som läste NEW). Lita
 *      alltså inte på grönt här för triggerlogik.
 *
 * Full verifiering kräver `supabase db reset` mot en riktig instans.
 *
 *     node scripts/validate-migrations.mjs
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
// libpg-query är CommonJS, så named imports fungerar inte från ESM.
// I v17 heter funktionerna `loadModule` (initierar wasm) och `parse`.
import { createRequire } from "node:module";
const { loadModule, parse, formatSqlError, hasSqlDetails } = createRequire(import.meta.url)(
  "libpg-query",
);

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(root, "supabase", "migrations");

const files = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort();

// seed-filerna körs också mot databasen och ska hålla samma krav.
const targets = [
  ...files.map((name) => ({ label: `migrations/${name}`, path: join(migrationsDir, name) })),
  { label: "seed.sql", path: join(root, "supabase", "seed.sql") },
  { label: "seed-staff.sql", path: join(root, "supabase", "seed-staff.sql") },
];

await loadModule();

let failures = 0;
let statements = 0;

for (const target of targets) {
  const sql = readFileSync(target.path, "utf8");

  try {
    const tree = await parse(sql);
    const count = tree.stmts?.length ?? 0;
    statements += count;
    console.log(`  ok    ${target.label.padEnd(42)} ${count} satser`);
  } catch (error) {
    failures += 1;
    console.error(`  FEL   ${target.label}`);
    console.error(`        ${hasSqlDetails?.(error) ? formatSqlError(error) : error.message}`);

    // Parsern anger byte-position. Räkna om till rad så felet går att hitta.
    const position = Number(error.cursorPosition ?? error.position ?? 0);
    if (position > 0) {
      const line = sql.slice(0, position).split("\n").length;
      console.error(`        rad ${line}: ${sql.split("\n")[line - 1]?.trim()}`);
    }
  }
}

console.log("");
if (failures > 0) {
  console.error(`${failures} fil(er) har syntaxfel.`);
  process.exit(1);
}
console.log(`${targets.length} filer, ${statements} satser — inga syntaxfel.`);
