-- 0043 — Ett presentkort som inte går att lösa in ska inte gå att ge ut.
--
-- `gift_cards.code` var `text` utan format. Applikationen håller ändå ordning:
-- dashboarden genererar koden med `generateGiftCardCode()` i `@burp/core`, och
-- inlösen kontrollerar den med `isValidGiftCardCode()` innan den ens slås upp.
--
-- Men `issue_gift_card()` tar emot vilken sträng som helst, och det är den väg
-- ett kort faktiskt skapas. Ett kort med en nolla i koden går därför att skriva
-- in i databasen — och kan sedan aldrig lösas in. Gästen står med ett kort som
-- API:t svarar "Presentkortet finns inte" om, trots att det ligger där.
--
-- Felet hittades av röktestet första gången det kördes på den här maskinen: det
-- gav ut kort med QR-kodens alfabet i stället för presentkortets, och slog fel
-- bara när slumpen råkade ge en nolla. Det som såg ut som ett flaxigt test var
-- en verklig lucka mellan två alfabet.
--
-- ── Alfabetet, och varför de två skiljer sig ────────────────────────────────
--
--   Presentkort  23456789ABCDEFGHJKLMNPQRSTUVWXYZ   utan 0, 1, I, O
--   QR-token     0123456789ABCDEFGHJKMNPQRSTVWXYZ   utan I, L, O, U
--
-- Kortets kod läses högt över ett bord och skrivs av från ett papper; där är
-- "0" mot "O" och "1" mot "I" skillnaden mellan att koden fungerar och att
-- gästen tror att den är falsk. QR-tokenet läses aldrig av en människa, och
-- utesluter i stället de tecken som är svåra i en maskinell avläsning.
--
-- Speglar `ALPHABET` i packages/core/src/gift-card.ts — **ändras den ena måste
-- den andra följa med.**

alter table public.gift_cards
  add constraint gift_cards_code_format
  check (code ~ '^[2-9A-HJ-NP-Z]{12}$')
  -- NOT VALID: befintliga rader kontrolleras inte. Det finns inga kort i
  -- produktion, men en utvecklares lokala databas kan ha kort från just den
  -- felaktiga generatorn — och en migration som faller på gammal testdata är en
  -- migration som inte går att köra.
  not valid;

comment on constraint gift_cards_code_format on public.gift_cards is
  'Tolv tecken ur 23456789A-Z utan I och O. Samma alfabet som isValidGiftCardCode() i @burp/core — ett kort som inte går att lösa in ska inte gå att ge ut.';
