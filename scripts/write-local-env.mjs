#!/usr/bin/env node
/**
 * Skriver in den lokala Supabase-stackens nycklar i apps/web/.env.local.
 *
 * `supabase start` skriver ut API-URL, anon-nyckel och service_role-nyckel i
 * terminalen. Att klippa och klistra dem för hand är lätt att göra fel — en
 * avklippt nyckel ger ett fel långt senare, i en fråga som ser orelaterad ut.
 *
 *     node scripts/write-local-env.mjs
 *
 * QR_TOKEN_SECRET och allt annat som redan står i filen behålls. Bara de fyra
 * Supabase-raderna skrivs om. Saknas QR_TOKEN_SECRET genereras en.
 *
 * Kräver att stacken är igång (`npx supabase start`).
 */

import { execSync } from "node:child_process";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Ett VAPID-nyckelpar, utan `web-push` och utan konto någonstans.
 *
 * VAPID identifierar Burp för webbläsarens egen pushtjänst. Det finns ingen
 * leverantör att registrera sig hos och ingenting att betala — nyckelparet är
 * ett vanligt P-256-par, och det är hela hemligheten. Ändå har push legat
 * oanvändbart sedan migration 0050 (2026-08-23) på ett kommando som ingen
 * körde.
 *
 * Räknas här i stället för med `web-push`s egen hjälpare, av samma skäl som
 * resten av skriptet inte importerar något ur `apps/web`: skriptet ska gå att
 * köra innan beroendena är installerade.
 *
 * Formatet är det pushtjänsterna kräver: den publika nyckeln som den
 * okomprimerade punkten `0x04 || x || y`, den privata som själva skalären.
 * Båda base64url utan utfyllnad — JWK levererar dem redan så.
 */
function vapidKeyPair() {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const pub = publicKey.export({ format: "jwk" });
  const priv = privateKey.export({ format: "jwk" });

  const b64 = (value) => Buffer.from(value, "base64url");
  const point = Buffer.concat([Buffer.from([0x04]), b64(pub.x), b64(pub.y)]);

  return { publicKey: point.toString("base64url"), privateKey: priv.d };
}
const envPath = join(root, "apps", "web", ".env.local");

let statusOutput;
try {
  // -o env ger KEY=VALUE-rader i stället för den ramade tabellen.
  // Node 20+ vägrar spawna .cmd-filer utan shell, och npx är en .cmd på
  // Windows. Kommandot körs därför som en sträng via skalet. Varje argument
  // är en literal här — ingenting kommer utifrån, så det finns inget att
  // escapa.
  statusOutput = execSync("npx --yes supabase status -o env", {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
} catch (error) {
  console.error("Kunde inte läsa av den lokala Supabase-stacken.\n");
  console.error("Kontrollera att Docker Desktop är igång och att stacken startats:\n");
  console.error("    npx supabase start\n");
  if (error.stderr) console.error(String(error.stderr).trim());
  process.exit(1);
}

const status = Object.fromEntries(
  statusOutput
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index), line.slice(index + 1).replace(/^"|"$/g, "")];
    }),
);

const apiUrl = status.API_URL;
const anonKey = status.ANON_KEY;
const serviceKey = status.SERVICE_ROLE_KEY;

if (!apiUrl || !anonKey || !serviceKey) {
  console.error("Svaret från `supabase status` saknade API_URL, ANON_KEY eller SERVICE_ROLE_KEY.");
  console.error("Fick nycklarna:", Object.keys(status).join(", ") || "(inga)");
  process.exit(1);
}

const existing = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";

const updates = {
  NEXT_PUBLIC_SUPABASE_URL: apiUrl,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
  SUPABASE_SERVICE_ROLE_KEY: serviceKey,
  SUPABASE_PROJECT_ID: "local",
};

// QR-nyckeln får aldrig skrivas över — byts den slutar alla utskrivna
// QR-koder att fungera, även de i seed-datan.
if (!/^QR_TOKEN_SECRET=.+$/m.test(existing)) {
  updates.QR_TOKEN_SECRET = randomBytes(32).toString("base64url");
}
if (!/^NEXT_PUBLIC_SITE_URL=.+$/m.test(existing)) {
  updates.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
}
if (!/^BURP_DEFAULT_FEE_BPS=.+$/m.test(existing)) {
  updates.BURP_DEFAULT_FEE_BPS = "340";
}
// Bakgrundsjobben under /api/jobs. Utan den svarar de 503 i stället för att
// köra öppet, och då går de inte att prova lokalt heller.
if (!/^CRON_SECRET=.+$/m.test(existing)) {
  updates.CRON_SECRET = randomBytes(24).toString("base64url");
}

/*
 * VAPID — utan dem når push ingen, varken personalens larm eller gästens
 * besked. Vägen är byggd hela vägen sedan migration 0050; det som saknades var
 * två rader i miljön.
 *
 * Paret genereras bara när BÅDA saknas. Ett halvt par är värre än inget: den
 * publika nyckeln ligger i webbläsarens prenumeration, och byts den privata
 * ensam slutar varje redan registrerad enhet att gå att nå — tyst, eftersom
 * pushtjänsten svarar 403 och ingen läser det svaret.
 *
 * De här är UTVECKLINGSNYCKLAR. Produktionen har sina egna, satta i Vercel,
 * och de ska aldrig vara samma.
 */
const hasPublicVapid = /^NEXT_PUBLIC_VAPID_PUBLIC_KEY=.+$/m.test(existing);
const hasPrivateVapid = /^VAPID_PRIVATE_KEY=.+$/m.test(existing);

if (!hasPublicVapid && !hasPrivateVapid) {
  const pair = vapidKeyPair();
  updates.NEXT_PUBLIC_VAPID_PUBLIC_KEY = pair.publicKey;
  updates.VAPID_PUBLIC_KEY = pair.publicKey;
  updates.VAPID_PRIVATE_KEY = pair.privateKey;
} else if (hasPublicVapid !== hasPrivateVapid) {
  console.warn(
    "VARNING: bara halva VAPID-paret står i .env.local. Push är avstängd tills\n" +
      "         båda finns. Ta bort raden som står kvar och kör om skriptet.",
  );
}

let output = existing;
for (const [key, value] of Object.entries(updates)) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  output = pattern.test(output) ? output.replace(pattern, line) : `${output.trimEnd()}\n${line}\n`;
}

// Den gamla rubriken säger "LOKALA PLATSHÅLLARE" och ber läsaren fylla i
// nycklar för hand. Efter den här körningen stämmer det inte längre, så
// ledande kommentarsrader byts ut mot en som beskriver filens faktiska läge.
const body = output.replace(/^(?:[ \t]*(?:#.*)?\r?\n)+/, "");
const header = [
  "# Skriven av scripts/write-local-env.mjs mot den lokala Supabase-stacken.",
  "# Nycklarna nedan är den lokala stackens välkända demonycklar — de duger",
  "# bara mot 127.0.0.1 och är inga hemligheter. Filen är gitignorerad.",
  "#",
  "# QR_TOKEN_SECRET är utvecklingsnyckel. Byts den slutar redan utskrivna",
  "# QR-koder att fungera, även seed-bordens.",
].join("\n");

writeFileSync(envPath, `${header}\n\n${body.trimStart()}`, "utf8");

console.log(`Skrev apps/web/.env.local mot ${apiUrl}`);
console.log("Kör `npm run dev` och sedan `node scripts/print-qr-links.mjs` för bordslänkarna.");

if (updates.VAPID_PRIVATE_KEY) {
  console.log("Genererade ett VAPID-par — webbpush går nu att prova lokalt.");
  console.log("Produktionen behöver ett EGET par i Vercels miljö. Se docs/DEPLOYMENT.md.");
}
