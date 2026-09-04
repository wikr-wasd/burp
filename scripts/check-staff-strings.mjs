#!/usr/bin/env node
/**
 * Letar efter text som står SKRIVEN i personalytorna i stället för i ordboken.
 *
 * Personalytorna följer personens eget språk — `staff.locale`, migration 0047.
 * En sträng som står i JSX:en gör inte det, och följden är en sida där
 * brödtexten är bosniska men rubriken svenska. Det syns aldrig i en diff och
 * aldrig för den som utvecklar på svenska.
 *
 * Sveptes för hand 2026-09-04 och gav 25 strängar i nio filer: hela
 * ekonomiavsnittet i statistiken, avräkningens rader, menyredigerarens fält
 * och — värst — utloggningsvarningen, den enda rutan som dyker upp av sig
 * själv utan att någon klickat.
 *
 * ── Vad kontrollen INTE gäller ─────────────────────────────────────────────
 *
 * `/backoffice` och `components/platform/`. Burps egen plattformsyta är svensk
 * med flit (CLAUDE.md): en plattformsadmin är inte personal någonstans och har
 * ingen `staff.locale`. Där en personalkomponent lånas skickas svenskan in
 * uttryckligen med `burpInternalSurface()`.
 *
 * ── Trubbigt med flit ──────────────────────────────────────────────────────
 *
 * Kontrollen läser JSX-textnoder och de attribut som blir synlig text. Den
 * missar strängar i uttryck och mallsträngar, och den kan inte veta om ett ord
 * är svenskt eller ett produktnamn. Den letar därför efter svenska bokstäver
 * och ett tjugotal småord — det som faktiskt fastnar är en glömd etikett, och
 * det är felet som ger en halvöversatt sida.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOTS = [
  "apps/web/src/app/dashboard",
  "apps/web/src/app/kok",
  "apps/web/src/components/staff",
];

/** Attribut vars strängvärde blir text någon läser. */
const ATTRIBUTE = /\b(?:label|title|placeholder|aria-label|alt|hint|intro)="([^"{}]{3,})"/g;

/** JSX-textnod: mellan > och <, utan taggar eller uttryck. */
const TEXT_NODE = />\s*([A-ZÅÄÖa-zåäö][^<>{}\n]{2,})\s*</g;

/**
 * Svenska tecken, eller ord som knappast står i en engelsk klassnamnssträng.
 *
 * "min" och "s" står inte med: de är förkortningar som ser likadana ut på alla
 * fem språken, och ordboken har dem redan som undantag.
 */
const SWEDISH =
  /[åäöÅÄÖ]|\b(och|eller|som|inte|till|för|med|per|av|den|det|ett|en|utan|kvar|varav|ingen|inga|era|ert|vid)\b/;

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else if (/\.tsx?$/.test(entry)) out.push(path);
  }
  return out;
}

/** Kommentarerna är fulla av svenska, och ska vara det. */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const findings = [];

for (const root of ROOTS) {
  for (const file of walk(root)) {
    const code = stripComments(readFileSync(file, "utf8"));
    const hits = new Set();

    for (const match of code.matchAll(ATTRIBUTE)) hits.add(match[1].trim());
    for (const match of code.matchAll(TEXT_NODE)) {
      const value = match[1].trim();
      if (value && !value.startsWith("http") && !value.startsWith("{")) hits.add(value);
    }

    const swedish = [...hits].filter((hit) => SWEDISH.test(hit)).sort();
    if (swedish.length > 0) findings.push([relative(process.cwd(), file), swedish]);
  }
}

if (findings.length === 0) {
  const files = ROOTS.map((root) => walk(root).length).reduce((a, b) => a + b, 0);
  console.log(`${files} filer i personalytorna — all text kommer ur ordboken.`);
  process.exit(0);
}

console.error("Text som står skriven i stället för i ordboken:\n");
for (const [file, hits] of findings) {
  console.error(`  ${file}`);
  for (const hit of hits) console.error(`      ${hit}`);
}
console.error(
  `\n${findings.length} fil(er). Personalytorna följer staff.locale — en sträng här ` +
    `blir svenska mitt i en bosnisk sida.`,
);
process.exit(1);
