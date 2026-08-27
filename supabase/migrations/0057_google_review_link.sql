-- 0057 — Länken till restaurangens Google-recensioner.
--
-- ── Vad som INTE går att bygga ──────────────────────────────────────────────
--
-- Att skicka Burps omdömen vidare till Google. Google Business Profile har
-- ingen skriv-endpoint för recensioner — ingen har det — och att posta gästens
-- text som restaurangens egen bryter mot både deras policy och GDPR: texten är
-- gästens personuppgift, inte restaurangens innehåll.
--
-- ── Vad som går ─────────────────────────────────────────────────────────────
--
-- Att fråga gästen som just skrivit ett omdöme om hon vill säga samma sak där
-- också. Länken är restaurangens egen och pekar rakt in i Googles formulär.
--
-- ── Varför den visas för ALLA, oavsett betyg ────────────────────────────────
--
-- Att bara visa länken för nöjda gäster kallas review gating och är förbjudet
-- av Google, och av EU:s konsumentregler sedan omnibusdirektivet. Regeln finns
-- därför inte som en inställning här: kolumnen är en adress, inte ett villkor,
-- och gränssnittet får ingen tröskel att sätta.

alter table public.restaurants
  add column google_review_url text
    check (
      google_review_url is null
      or google_review_url ~ '^https://(www\.)?(google\.[a-z.]+|g\.page|search\.google\.com|maps\.app\.goo\.gl)/'
    );

comment on column public.restaurants.google_review_url is
  'Restaurangens egen länk till Googles recensionsformulär. Visas för varje gäst som lämnat ett omdöme, oavsett betyg — att bara visa den för nöjda gäster är review gating och förbjudet av både Google och EU:s konsumentregler. Burp skickar aldrig omdömen dit; Google tar inte emot dem.';
