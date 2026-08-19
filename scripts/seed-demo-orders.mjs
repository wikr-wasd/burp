#!/usr/bin/env node
/**
 * Fyller den lokala databasen med 75 dagars orderhistorik.
 *
 *     npm run db:demo
 *
 * Kör `supabase/seed-orders.sql`, som medvetet INTE ingår i `supabase db reset`
 * — skälet står i filens egen inledning. Kör om den efter varje reset.
 *
 * Skriptet talar med databasen genom en engångscontainer, precis som
 * `scripts/smoke.sh`: det finns ingen `psql` installerad på den här maskinen,
 * och att kräva en hade gjort demodatan otillgänglig för den som bara har
 * Docker. Containernamnet på Supabase-stacken används inte — det byts med
 * projektnamnet, och `host.docker.internal:54322` gör det.
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sqlFile = join(root, "supabase", "seed-orders.sql");

if (!existsSync(sqlFile)) {
  console.error(`Hittar inte ${sqlFile}`);
  process.exit(1);
}

const DB = "postgresql://postgres:postgres@host.docker.internal:54322/postgres";
const IMAGE = "postgres:17-alpine";

// Supabase CLI 2.114 klarar inte Docker Engine 29:s API. Samma pinning som
// resten av projektet använder; utan den går stacken inte att köra alls här.
const env = { ...process.env, DOCKER_API_VERSION: process.env.DOCKER_API_VERSION ?? "1.47" };

// MSYS_NO_PATHCONV hindrar Git Bash från att skriva om anslutningssträngen till
// en Windows-sökväg. Samma rad finns i smoke.sh av samma skäl.
env.MSYS_NO_PATHCONV = "1";

const result = spawnSync(
  "docker",
  [
    "run",
    "--rm",
    "-i",
    "-v",
    `${root}:/repo:ro`,
    IMAGE,
    "psql",
    DB,
    "-v",
    "ON_ERROR_STOP=1",
    "--quiet",
    "--no-psqlrc",
    "-f",
    "/repo/supabase/seed-orders.sql",
  ],
  { stdio: "inherit", env },
);

if (result.error) {
  console.error("Kunde inte starta docker:", result.error.message);
  console.error("Docker Desktop ligger under AppData\\Local\\Programs\\DockerDesktop\\resources\\bin");
  console.error("och hamnar på PATH först när ett nytt skal startas.");
  process.exit(1);
}

if (result.status !== 0) {
  console.error("\nDemodatan kunde inte läggas in. Kör `npx supabase start` först.");
  process.exit(result.status ?? 1);
}

console.log("\nDemodata inlagd. Kör `npm run db:reset` för att bli av med den.");
