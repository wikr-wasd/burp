#!/usr/bin/env node
/**
 * Kontrollerar att varje fråga som går förbi RLS filtrerar själv.
 *
 * `createAdminClient()` använder service role och kringgår ALL row level
 * security. Regel 5 i CLAUDE.md säger att varje sådant anrop måste filtrera på
 * `restaurant_id` — men regeln bars fram till 2026-08-22 bara av att den som
 * skrev koden mindes den.
 *
 * Det är den enskilt största läckagerisken i arkitekturen, just för att den är
 * osynlig: ett glömt `.eq("restaurant_id", …)` ger en fråga som returnerar
 * ALLA restaurangers rader utan att något test faller. RLS-svepet i
 * `verify-schema-tests.sql` prövar den inloggade vägen, inte den här.
 *
 * ── Vad kontrollen letar efter ─────────────────────────────────────────────
 *
 * Första utkastet krävde ett bokstavligt `restaurant_id` och fällde 23 av 23
 * frågor. Alla var korrekta: `menu_categories` filtreras på `menu_id` ur en
 * meny som redan hörde till restaurangen, `menu_items` på `category_id` ur
 * den listan, bordet på sitt HMAC-signerade token. Begränsningen ärvs — den
 * står bara inte i just den raden. Regeln var fel, inte koden.
 *
 * Kontrollen letar därför efter den form som faktiskt lämnar ut allt: en
 * fråga UTAN filter alls. `.from("orders").select(…)` utan `.eq` returnerar
 * varenda restaurangs rader, och ingen RLS står i vägen.
 *
 * Det är trubbigt med flit. En fråga som filtrerar på fel sak går igenom, och
 * den sortens fel får läsningen fånga. Men "jag glömde filtret" — det felet
 * kan den här inte missa, och det är det som ger en incident.
 *
 * En fråga som verkligen ska gå över hela plattformen märks med en rad:
 *
 *     // service-role: hela plattformen — <skälet>
 *
 * Då blir varje sådan rad något någon aktivt skrivit.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = "apps/web/src";
const MARKER = "service-role: hela plattformen";

/**
 * Sätt som en fråga kan smalnas av.
 *
 * `.single()` och `.maybeSingle()` räknas INTE — de begränsar svaret till en
 * rad men inte vilken. En osorterad fråga utan filter med `.maybeSingle()`
 * ger en godtycklig restaurangs data, vilket är värre än ett tydligt fel.
 */
const NARROWING =
  /\.(eq|neq|in|match|contains|containedBy|filter|or|textSearch|lt|lte|gt|gte|is|overlaps)\(/;

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/**
 * Plockar ut varje `.from("tabell")`-kedja och det som följer den.
 *
 * Kedjan slutar vid nästa `await`, `const` eller semikolon på egen rad —
 * grovt, men tillräckligt för att fånga `.eq()`-anropen som hör till frågan.
 */
function chains(source) {
  const found = [];
  const pattern = /\.from\(\s*["']([a-z_]+)["']\s*\)/g;
  let match;

  while ((match = pattern.exec(source)) !== null) {
    const table = match[1];
    const rest = source.slice(match.index, match.index + 600);
    const end = rest.search(/;\s*\n/);
    found.push({
      table,
      chain: end === -1 ? rest : rest.slice(0, end),
      line: source.slice(0, match.index).split("\n").length,
    });
  }

  return found;
}

const problems = [];
let checked = 0;
let exempted = 0;

for (const file of walk(ROOT)) {
  const source = readFileSync(file, "utf8");
  if (!source.includes("createAdminClient")) continue;

  // Filer som bara importerar typen räknas inte.
  if (!/createAdminClient\s*\(/.test(source)) continue;

  for (const { table, chain, line } of chains(source)) {
    /*
     * En insert läcker inga rader.
     *
     * `.insert()` och `.upsert()` skriver, de läser inte, och ett filter vore
     * meningslöst. Uppdateringar och raderingar räknas däremot: en `.update()`
     * utan filter skriver om varenda restaurangs rader på en gång.
     */
    if (/\.(insert|upsert)\(/.test(chain) && !/\.(update|delete)\(/.test(chain)) continue;

    checked += 1;

    if (chain.includes(MARKER)) {
      exempted += 1;
      continue;
    }

    if (!NARROWING.test(chain)) {
      problems.push(`${relative(".", file)}:${line}  .from("${table}") utan något filter alls`);
    }
  }
}

if (problems.length > 0) {
  console.error("Frågor förbi RLS som hämtar hela tabellen:\n");
  for (const problem of problems) console.error(`  ${problem}`);
  console.error(`\nSmalna av frågan, eller märk raden med:\n  // ${MARKER} — <skälet>`);
  process.exit(1);
}

console.log(
  `${checked} frågor förbi RLS kontrollerade, ${exempted} uttryckligt undantagna — alla filtrerar.`,
);
