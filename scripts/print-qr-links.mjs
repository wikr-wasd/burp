#!/usr/bin/env node
/**
 * Skriver ut körbara QR-länkar för borden i seed-datan.
 *
 * Signaturen i tokenet beror på QR_TOKEN_SECRET och kan därför inte ligga i
 * seed.sql. Kör det här skriptet efter `supabase db reset` för att få länkarna
 * som faktiskt fungerar mot din lokala miljö.
 *
 *     node scripts/print-qr-links.mjs
 *
 * För riktiga bord genererar dashboarden koderna — det här är bara för test.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Läser .env.local utan extra beroende. Enkel parser: KEY=VALUE, # är kommentar.
function loadEnv(file) {
  try {
    return Object.fromEntries(
      readFileSync(join(root, file), "utf8")
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#"))
        .map((line) => {
          const index = line.indexOf("=");
          return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
        }),
    );
  } catch {
    return {};
  }
}

// Next.js läser sin env från appens katalog, inte från repo-roten. Rotfilen
// stöds fortfarande som fallback för den som lagt den där.
const env = { ...loadEnv(".env.local"), ...loadEnv("apps/web/.env.local"), ...process.env };
const secret = env.QR_TOKEN_SECRET;
const siteUrl = env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

if (!secret) {
  console.error("QR_TOKEN_SECRET saknas. Lägg den i .env.local först.");
  console.error(
    'Generera en: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64url\'))"',
  );
  process.exit(1);
}

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const SIGNATURE_LENGTH = 4;

async function sign(publicId) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(publicId)),
  );
  let signature = "";
  for (let i = 0; i < SIGNATURE_LENGTH; i++) {
    signature += ALPHABET[mac[i] % ALPHABET.length];
  }
  return signature;
}

/*
 * Borden läses UR seed.sql i stället för att stå avskrivna här.
 *
 * Listan var tidigare hårdkodad med kommentaren "samma publika id:n som i
 * supabase/seed.sql". Den var inte det: zonerna stod kvar som "Fönstret" och
 * "Uteservering" långt efter att seeden bytt till Bašta och Unutra, och när
 * borden blev femton skrev skriptet fortfarande ut tre. En kommentar som
 * lovar att två filer följs åt är inget som håller dem i takt.
 *
 * Filen läses med en regex och inte med en SQL-parser. Det räcker: raderna har
 * en fast form, och alternativet — att fråga databasen — hade gjort skriptet
 * beroende av en igång Supabase-stack för att skriva ut länkar som bara beror
 * på hemligheten.
 */
function readSeedTables() {
  const sql = readFileSync(join(root, "supabase/seed.sql"), "utf8");
  const insert = sql.match(
    /insert into public\.tables[^;]*?values\s*([\s\S]*?);/i,
  );

  if (!insert) return [];

  const rows = [...insert[1].matchAll(
    /\(\s*'[^']*'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*\d+\s*,\s*'([^']*)'\s*,\s*'ACTIVE'\s*\)/g,
  )];

  return rows.map(([, number, zone, publicId]) => ({ number, zone, publicId }));
}

const tables = readSeedTables();

if (tables.length === 0) {
  console.error("Hittade inga bord i supabase/seed.sql — har formatet ändrats?");
  process.exit(1);
}

console.log(`\nQR-länkar för seed-borden (${tables.length} st):\n`);

let zone = null;
for (const table of tables.sort(
  (a, b) => a.zone.localeCompare(b.zone, "sv") || Number(a.number) - Number(b.number),
)) {
  if (table.zone !== zone) {
    zone = table.zone;
    console.log(`  ── ${zone} ──\n`);
  }

  const token = table.publicId + (await sign(table.publicId));
  console.log(`  Bord ${table.number}`);
  console.log(`    ${siteUrl}/t/${token}\n`);
}
