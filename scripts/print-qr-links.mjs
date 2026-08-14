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

// Samma publika id:n som i supabase/seed.sql.
const tables = [
  { number: "1", zone: "Fönstret", publicId: "R7K2M9" },
  { number: "2", zone: "Fönstret", publicId: "B3H8N5" },
  { number: "3", zone: "Uteservering", publicId: "X9V4T2" },
];

console.log("\nQR-länkar för seed-borden:\n");
for (const table of tables) {
  const token = table.publicId + (await sign(table.publicId));
  console.log(`  Bord ${table.number} (${table.zone})`);
  console.log(`    ${siteUrl}/t/${token}\n`);
}
