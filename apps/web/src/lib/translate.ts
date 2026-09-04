import "server-only";

import { chunk, isTranslatable, normalizeSource, translationKey } from "@burp/core";
import { serverEnv } from "./env";
import type { Locale } from "./i18n/config";
import { createAdminClient } from "./supabase/admin";

/**
 * Maskinöversättning av det MÄNNISKOR skrivit (öppen fråga 16).
 *
 * Gränssnittet har fem ordböcker och behöver ingen maskin. Det här gäller
 * texten som restaurangen och gästen skriver själva: en rättbeskrivning, ett
 * meddelande till köket, en anteckning på en bokning. Den finns bara på ett
 * språk, och det är sällan läsarens.
 *
 * ── Utan nyckel fungerar allt ändå ─────────────────────────────────────────
 *
 * Samma form som `sendEmail()`: saknas `GOOGLE_TRANSLATE_API_KEY` returneras
 * originaltexten med `translated: false`, och gränssnittet visar den utan att
 * påstå att något översatts. Ingen sida faller, ingen ruta blir tom, och
 * produkten går att köra utan ett leverantörskonto. Det är också läget i dag.
 *
 * ── Aldrig ett fel uppåt ───────────────────────────────────────────────────
 *
 * En översättning som inte går igenom får aldrig fälla sidan den satt på. En
 * meny på fel språk går att beställa ifrån; en meny som svarar 500 går inte.
 * Varje väg ut ur den här modulen slutar därför i originaltexten.
 *
 * ── Vad som ALDRIG går den här vägen ───────────────────────────────────────
 *
 * Allergener — de blev koder i migration 0071 just därför att en maskin som
 * gissar fel på "nötter" ger ett svar man inte vill ge en allergiker. Priser,
 * som är tal. Och restaurangens namn, som är ett egennamn.
 */

export interface Translated {
  /** Texten att visa: översatt om det gick, annars originalet. */
  text: string;
  /** Falskt när originalet visas — då ska ingen "översatt automatiskt" stå. */
  translated: boolean;
}

/** Så många texter per anrop. Ett för långt anrop avvisas i sin helhet. */
const BATCH_SIZE = 50;

/** Tiden ett anrop får ta. En meny får inte vänta på en leverantör som hänger. */
const TIMEOUT_MS = 6_000;

const PROVIDER = "GOOGLE";

/** Ett original, oöversatt. Den enda formen ett fel får ta här. */
function asIs(text: string): Translated {
  return { text, translated: false };
}

export async function translateText(text: string, target: Locale): Promise<Translated> {
  const [only] = await translateMany([text], target);
  return only ?? asIs(text);
}

/**
 * Översätter en lista i samma ordning som den kom in.
 *
 * Ordningen är kontraktet: anroparen sätter ihop resultatet med sina egna
 * rader på index. En lista som kommer tillbaka i annan ordning skulle sätta
 * fel beskrivning på fel rätt — vilket är värre än ingen översättning alls.
 */
export async function translateMany(
  texts: readonly string[],
  target: Locale,
): Promise<Translated[]> {
  const result: Translated[] = texts.map((text) => asIs(text));
  if (texts.length === 0) return result;

  // Vad som är värt att skicka: text med ord i, som inte redan står i kön.
  const wanted = new Map<string, number[]>();

  for (const [index, text] of texts.entries()) {
    if (!isTranslatable(text)) continue;

    const normalized = normalizeSource(text);
    const existing = wanted.get(normalized);
    if (existing) existing.push(index);
    else wanted.set(normalized, [index]);
  }

  if (wanted.size === 0) return result;

  const sources = [...wanted.keys()];
  const keys = await Promise.all(sources.map((source) => translationKey(source, target)));

  const cached = await readCache(keys);
  const missing: { source: string; key: string }[] = [];

  for (const [position, source] of sources.entries()) {
    const key = keys[position]!;
    const hit = cached.get(key);
    const indices = wanted.get(source) ?? [];

    if (hit) {
      for (const index of indices) result[index] = hit;
    } else {
      missing.push({ source, key });
    }
  }

  if (missing.length === 0) return result;

  const fresh = await callProvider(
    missing.map((entry) => entry.source),
    target,
  );

  if (!fresh) return result;

  const rows: CacheRow[] = [];

  for (const [position, entry] of missing.entries()) {
    const answer = fresh[position];
    if (!answer) continue;

    const value: Translated = {
      text: answer.text,
      // Motorn kände igen källan som målspråket: texten var redan rätt, och
      // då ska ingen etikett påstå att den översatts.
      translated: answer.detected !== target && answer.text !== entry.source,
    };

    for (const index of wanted.get(entry.source) ?? []) result[index] = value;

    rows.push({
      source_hash: entry.key,
      target_locale: target,
      text: value.text,
      translated: value.translated,
      source_locale: answer.detected,
      provider: PROVIDER,
    });
  }

  await writeCache(rows);
  return result;
}

/* ── Cachen ──────────────────────────────────────────────────────────────── */

interface CacheRow {
  source_hash: string;
  target_locale: string;
  text: string;
  translated: boolean;
  source_locale: string | null;
  provider: string;
}

/**
 * Slår upp färdiga översättningar.
 *
 * service-role: hela plattformen — `translations` är innehållsadresserad och
 * hör inte till någon restaurang. Samma hash av "utan lök" delas av alla, och
 * tabellen har därför ingen `restaurant_id` att filtrera på. Frågan är alltid
 * begränsad till de hashar anroparen räknat fram; den sveper aldrig tabellen.
 */
async function readCache(keys: readonly string[]): Promise<Map<string, Translated>> {
  const found = new Map<string, Translated>();
  if (keys.length === 0) return found;

  try {
    const supabase = createAdminClient();

    for (const batch of chunk(keys, 200)) {
      const { data, error } = await supabase
        .from("translations")
        .select("source_hash, text, translated")
        .in("source_hash", batch);

      if (error || !data) continue;

      for (const row of data) {
        found.set(row.source_hash, { text: row.text, translated: row.translated });
      }
    }
  } catch {
    // En trasig cache är en långsam sida, inte en trasig. Nästa steg frågar
    // leverantören ändå.
  }

  return found;
}

async function writeCache(rows: readonly CacheRow[]): Promise<void> {
  if (rows.length === 0) return;

  try {
    const supabase = createAdminClient();
    // `upsert` och inte `insert`: två besökare kan ha bett om samma text
    // samtidigt, och en krock på primärnyckeln är då ett kvitto på att det
    // fungerade — inte ett fel att kasta uppåt.
    await supabase.from("translations").upsert([...rows], { onConflict: "source_hash" });
  } catch {
    // Skrivningen är en optimering. Går den inte igenom betalar nästa besökare
    // för samma anrop, vilket är allt som händer.
  }
}

/* ── Leverantören ────────────────────────────────────────────────────────── */

interface ProviderAnswer {
  text: string;
  /** Vad motorn trodde att källan var. Null när den inte sa något. */
  detected: string | null;
}

/**
 * Google Cloud Translation v2.
 *
 * Valet står i öppen fråga 16: 500 000 tecken i månaden utan kostnad, och —
 * det som avgjorde — stöd för bosniska, kroatiska och serbiska. DeepL är
 * bättre på de språk det har, men hade inte marknadens.
 *
 * `format: "text"` och inte "html": vi skickar rena strängar, och HTML-läget
 * hade gett tillbaka entiteter som `&#39;` mitt i en rättbeskrivning.
 */
async function callProvider(
  sources: readonly string[],
  target: Locale,
): Promise<ProviderAnswer[] | null> {
  const key = serverEnv().GOOGLE_TRANSLATE_API_KEY;

  if (!key) {
    // Samma form som `sendEmail()` utan RESEND_API_KEY: produkten fungerar,
    // texten står kvar på sitt eget språk, och loggen säger varför.
    console.info(
      `[översättning] Ingen GOOGLE_TRANSLATE_API_KEY satt — ${sources.length} text(er) ` +
        `visas på sitt originalspråk i stället för på ${target}.`,
    );
    return null;
  }

  const answers: ProviderAnswer[] = [];

  for (const batch of chunk(sources, BATCH_SIZE)) {
    try {
      const response = await fetch(
        `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(key)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ q: [...batch], target, format: "text" }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        },
      );

      if (!response.ok) {
        console.warn(`[översättning] ${response.status} från leverantören — originalet visas.`);
        return null;
      }

      const body: unknown = await response.json();
      const list = (body as { data?: { translations?: unknown[] } }).data?.translations;

      if (!Array.isArray(list) || list.length !== batch.length) {
        // Ordningen är kontraktet. Ett svar med fel antal går inte att para
        // ihop med sina rader, och en gissning hade satt fel beskrivning på
        // fel rätt.
        console.warn("[översättning] Oväntat svar från leverantören — originalet visas.");
        return null;
      }

      for (const item of list) {
        const row = item as { translatedText?: unknown; detectedSourceLanguage?: unknown };
        answers.push({
          text: typeof row.translatedText === "string" ? row.translatedText : "",
          detected:
            typeof row.detectedSourceLanguage === "string" ? row.detectedSourceLanguage : null,
        });
      }
    } catch (error) {
      console.warn("[översättning] Leverantören svarade inte — originalet visas.", error);
      return null;
    }
  }

  // En tom sträng tillbaka är inte en översättning. Låt originalet stå.
  return answers.map((answer, index) =>
    answer.text.trim() === "" ? { text: sources[index]!, detected: null } : answer,
  );
}
