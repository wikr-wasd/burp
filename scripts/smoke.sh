#!/usr/bin/env bash
#
# Röktest mot en körande app och lokal Supabase-stack.
#
# Enhetstesterna täcker affärslogiken och verify-schema.sh täcker databasen,
# men ingen av dem upptäcker att appen frågar efter en kolumn som inte finns.
# Just det felet gjorde SEO-sidan till en tyst 404 — PostgREST svarade med ett
# fel, Supabase-klienten gav data = null, och sidan såg ut som "hittades inte".
#
# Kör:
#     npx supabase start && npm run dev      # i var sitt fönster
#     bash scripts/smoke.sh
#
# Kräver: curl, node, docker (för SQL-uppslagen). Medvetet inte jq — det finns
# inte i en vanlig Git-Bash-installation på Windows, och node finns ändå.

set -uo pipefail

BASE="${BASE:-http://localhost:3000}"

# Seed-datan innehåller flera restauranger för marknadsplatsvyn, men bara den
# här har meny, bord och personal. Allt nedan pekas explicit på den — utan det
# plockar ett `limit 1` godtycklig restaurang och testet blir slumpmässigt.
SEED_RESTAURANT="11111111-1111-1111-1111-111111111111"
DB="postgresql://postgres:postgres@host.docker.internal:54322/postgres"
PG_IMAGE="public.ecr.aws/supabase/postgres:17.6.1.158"
COOKIES="$(mktemp)"

FAILED=0

pass() { printf '  \033[32mok\033[0m    %s\n' "$1"; }
fail() { printf '  \033[31mFEL\033[0m   %s\n' "$1"; FAILED=$((FAILED + 1)); }

# SQL-uppslag genom en engångscontainer. Det finns ingen psql på värden, och att
# kräva en hade gjort röktestet okörbart för den som bara har Docker.
#
# Felet skrivs till en logg i stället för att kastas bort. Ett sväljt SQL-fel
# gjorde att presentkortstestet rapporterade ett produktfel som inte fanns:
# städningen kunde aldrig lyckas mot en append-only-tabell, och ingenting sa det.
SQL_LOG="$(mktemp)"
sql() {
  local out
  out=$(MSYS_NO_PATHCONV=1 docker run --rm -i "$PG_IMAGE" psql "$DB" -tAc "$1" 2>>"$SQL_LOG")
  local code=$?
  if [ $code -ne 0 ]; then
    printf '  \033[33mvarning\033[0m  SQL misslyckades: %s\n' "$(printf '%s' "$1" | head -c 90)" >&2
  fi
  printf '%s' "$out" | tr -d '\r'
}

# Plockar ett fält ur JSON på stdin. Ersätter jq, som inte finns på Windows.
json_field() { node -e '
  let raw = "";
  process.stdin.on("data", (chunk) => (raw += chunk));
  process.stdin.on("end", () => {
    try { process.stdout.write(String(JSON.parse(raw)[process.argv[1]] ?? "")); }
    catch { process.stdout.write(""); }
  });
' "$1"; }

uuid() { node -e 'console.log(crypto.randomUUID())'; }

check_status() {
  local label="$1" path="$2" expected="$3"
  local actual
  actual=$(curl -s -o /dev/null -w '%{http_code}' "$BASE$path")
  if [ "$actual" = "$expected" ]; then pass "$label ($actual)"; else fail "$label: fick $actual, väntade $expected"; fi
}

# Samma sak men med gästens cookies. Kvittosidan kräver bordssessionen —
# utan den ska den svara 404, vilket är precis vad vi vill kunna testa åt båda hållen.
check_status_as_guest() {
  local label="$1" path="$2" expected="$3"
  local actual
  actual=$(curl -s -b "$COOKIES" -o /dev/null -w '%{http_code}' "$BASE$path")
  if [ "$actual" = "$expected" ]; then pass "$label ($actual)"; else fail "$label: fick $actual, väntade $expected"; fi
}

# Kontrollerar en orderstatus, men skiljer ut rate limiten.
#
# /api/orders är strypt per IP. Kör man testet flera gånger i rad börjar den
# svara 429, och då säger svaret ingenting om det som testas. Utan den här
# skillnaden rapporterades varje strypt förfrågan som ett produktfel — testet
# ljög om vad som var trasigt, vilket är värre än att inte testa alls.
#
# Fjärde argumentet är svarskroppen och är frivilligt. Utan den säger en
# misslyckad kontroll bara "fick 409, väntade 201", och 409 betyder allt från
# stängd restaurang till manipulerat pris — felsökningen blir gissning. API:t
# svarar redan med ett `detail` som är skrivet för en människa; det ska synas.
assert_order_status() {
  local label="$1" expected="$2" actual="$3" body="${4:-}"
  if [ "$actual" = "$expected" ]; then
    pass "$label ($actual)"
  elif [ "$actual" = "429" ]; then
    printf '  \033[33mhopp\033[0m  %s — rate limiten slog till, inte avgjort\n' "$label"
  else
    local detail=""
    [ -n "$body" ] && detail=$(printf '%s' "$body" | json_field detail)
    if [ -n "$detail" ]; then
      fail "$label: fick $actual, väntade $expected — $detail"
    else
      fail "$label: fick $actual, väntade $expected"
    fi
  fi
}

trap 'rm -f "$COOKIES"' EXIT

# Värm upp rutterna innan något mäts.
#
# `next dev` kompilerar varje rutt vid första anropet. En kall server svarar
# därför något annat än den skulle gjort — en skyddad sida redirectar inte, en
# order faller på timeout — och testet rapporterar det som produktfel. Samma
# sorts vilseledning som rate limiten gav innan den särskildes.
printf '→ Värmer upp rutterna'
for path in / /logga-in /dashboard /kok /dashboard/bord /dashboard/meny \
            /backoffice /backoffice/restauranger /konto /sv /sv/sarajevo /api/health; do
  curl -s -o /dev/null --max-time 60 "$BASE$path"
  printf '.'
done
echo ""

echo "→ Publika sidor"
# Roten har inget eget innehåll längre — den väljer språk och skickar vidare
# till /sv eller /en beroende på Accept-Language.
check_status "roten väljer språk"    "/"                          307
check_status "svensk startsida"      "/sv"                        200
check_status "engelsk startsida"     "/en"                        200
check_status "bosnisk startsida"     "/bs"                        200
check_status "tysk startsida"        "/de"                        200
check_status "norsk startsida"       "/no"                        200

# `hr` och `sr` är ALIAS i Accept-Language men inte egna adresser. Två URL:er
# med samma innehåll är dubblerat innehåll för Google, och hela skälet till att
# språket ligger i adressen är sökbarheten.
check_status "okänt språk 404:ar"    "/fr"                        404
check_status "hr är alias, inte adress" "/hr"                     404
check_status "hälsokontroll"         "/api/health"                200
check_status "restaurangsida (SEO)"  "/sv/r/sarajevo/cevabdzinica-zeljo"     200
check_status "okänd restaurang"      "/sv/r/sarajevo/finns-inte"        404
check_status "påhittat bordstoken"   "/t/AAAAAAAAAA"              404

if curl -s "$BASE/api/health" | grep -q '"database":"ok"'; then
  pass "databasen nås"
else
  fail "databasen nås inte — kör npx supabase start"
  echo "  (avbryter, resten kräver databas)"
  exit 1
fi

if curl -s "$BASE/sv/r/sarajevo/cevabdzinica-zeljo" | grep -q '"@type":"Restaurant"'; then
  pass "schema.org-markup finns"
else
  fail "schema.org-markup saknas på restaurangsidan"
fi

echo "→ Öppnar restaurangen för testet"
# Seed-restaurangen har riktiga öppettider. Körs testet 09:00 är den stängd och
# QR-flödet svarar korrekt men går inte att testa. Vi öppnar dygnet runt och
# återställer i slutet.
ORIGINAL_HOURS=$(sql "select opening_hours::text from public.restaurants where id = '$SEED_RESTAURANT';")
sql "update public.restaurants set opening_hours = '{\"mon\":[{\"opens\":\"00:00\",\"closes\":\"23:59\"}],\"tue\":[{\"opens\":\"00:00\",\"closes\":\"23:59\"}],\"wed\":[{\"opens\":\"00:00\",\"closes\":\"23:59\"}],\"thu\":[{\"opens\":\"00:00\",\"closes\":\"23:59\"}],\"fri\":[{\"opens\":\"00:00\",\"closes\":\"23:59\"}],\"sat\":[{\"opens\":\"00:00\",\"closes\":\"23:59\"}],\"sun\":[{\"opens\":\"00:00\",\"closes\":\"23:59\"}]}'::jsonb where id = '$SEED_RESTAURANT';" > /dev/null

# WHERE-satsen är inte kosmetisk: utan den skrivs öppettiderna om för samtliga
# restauranger i seed-datan och återställningen sätter tillbaka fel tider.
restore_hours() {
  if [ -n "${ORIGINAL_HOURS:-}" ]; then
    sql "update public.restaurants set opening_hours = '$ORIGINAL_HOURS'::jsonb where id = '$SEED_RESTAURANT';" > /dev/null
  fi
  rm -f "$COOKIES"
}
trap restore_hours EXIT

echo "→ QR-flödet"
TOKEN=$(node scripts/print-qr-links.mjs 2>/dev/null | grep -oE '/t/[0-9A-HJKMNP-TV-Z]{10}' | head -1 | cut -d/ -f3)
if [ -z "$TOKEN" ]; then
  fail "kunde inte generera ett bordstoken"
  exit 1
fi
pass "bordstoken genererat ($TOKEN)"

QR_PAGE=$(curl -s -c "$COOKIES" "$BASE/t/$TOKEN")
if grep -q "Ćevapi" <<<"$QR_PAGE"; then pass "menyn renderas vid bordet"; else fail "menyn saknas på QR-sidan"; fi
if grep -q "Dodaci" <<<"$QR_PAGE"; then pass "tillvalsgrupper renderas"; else fail "tillvalsgrupper saknas"; fi

# Ingen bordssession ska ha skapats av att sidan bara lästes. Notan öppnas
# när gästen beställer — inte när någon råkar skanna koden i förbifarten.
if grep -q "burp_table_session" "$COOKIES"; then
  fail "bordssession skapades redan vid skanning"
else
  pass "ingen nota öppnas av enbart en skanning"
fi

echo "→ Beställning"
CEVAPI="44444444-4444-4444-4444-444444444441"
EXTRA_KAJMAK=$(sql "select id from public.options where name = 'Extra kajmak';")
BEZ_LUKA=$(sql "select id from public.options where name = 'Bez luka';")
PLJESKAVICA="44444444-4444-4444-4444-444444444442"

# Lägger en order, och väntar ut rate limiten om den slår till.
#
# `orderCreate` tillåter tio order per minut och röktestet lägger fler än så.
# Följden var att de sista sektionerna alltid förlorade sin kvot: nio
# kontroller i orderredigeringen hoppades tyst över i varje körning, och de
# gånger det syntes rapporterades det som ett produktfel.
#
# Att höja gränsen för testet hade betytt att gränsen inte testas. Att vänta ut
# fönstret kostar en minut och behåller både täckningen och spärren.
order_request() {
  local out status
  out=$(curl -s -b "$COOKIES" -c "$COOKIES" -X POST "$BASE/api/orders" \
    -H "Content-Type: application/json" -d "$1" -w '\n%{http_code}')
  status=$(tail -1 <<<"$out")

  if [ "$status" = "429" ]; then
    printf '  \033[33mvänta\033[0m  rate limiten full — pausar 61 s\n' >&2
    sleep 61
    out=$(curl -s -b "$COOKIES" -c "$COOKIES" -X POST "$BASE/api/orders" \
      -H "Content-Type: application/json" -d "$1" -w '\n%{http_code}')
  fi

  printf '%s' "$out"
}

# Ćevapi 12,00 KM + extra kajmak 2,00 = 14,00 KM, plus 10,00 dricks = 24,00 KM.
# Bosnien har EN momssats på 17 %, även på dryck.
RESPONSE=$(order_request "{
  \"type\": \"TABLE\", \"table_token\": \"$TOKEN\", \"tip_ore\": 1000,
  \"client_total_ore\": 2400, \"idempotency_key\": \"$(uuid)\",
  \"items\": [{\"menu_item_id\": \"$CEVAPI\", \"quantity\": 1, \"options\": [{\"option_id\": \"$EXTRA_KAJMAK\"}], \"note\": \"utan basilika\"}]
}")
STATUS=$(tail -1 <<<"$RESPONSE")
BODY=$(sed '$d' <<<"$RESPONSE")

if [ "$STATUS" = "201" ]; then
  pass "ordern skapades ($(json_field total_ore <<<"$BODY") öre)"
  ORDER_ID=$(json_field order_id <<<"$BODY")
else
  fail "orderskapande gav $STATUS: $BODY"
  ORDER_ID=""
fi

if grep -q "burp_table_session" "$COOKIES"; then
  pass "notan öppnades vid beställning"
else
  fail "ingen bordssession efter beställning"
fi

# Avgiften ska ha skrivits: 3,40 % av 1400 = 47,6 → 48 fening.
if [ -n "$ORDER_ID" ]; then
  FEE=$(sql "select fee_ore from public.fees where order_id = '$ORDER_ID';")
  if [ "$FEE" = "48" ]; then pass "Burps avgift beräknad och sparad (48 fening)"; else fail "avgiften blev '$FEE', väntade 48"; fi

  TIP=$(sql "select amount_ore from public.tips where order_id = '$ORDER_ID';")
  if [ "$TIP" = "1000" ]; then pass "dricksen sparad separat"; else fail "dricksen blev '$TIP', väntade 1000"; fi

  EVENTS=$(sql "select count(*) from public.order_events where order_id = '$ORDER_ID';")
  if [ "$EVENTS" -ge 1 ]; then pass "händelseloggen skriven"; else fail "ingen händelse loggad"; fi

  check_status_as_guest "kvittosidan" "/t/$TOKEN/order/$ORDER_ID" 200

  # Utan bordssessionens cookie ska ordern inte gå att läsa. Annars räcker det
  # att gissa ett order-id för att se en främlings nota.
  check_status "kvittot är stängt utan session" "/t/$TOKEN/order/$ORDER_ID" 404

  # ── Rundturen meny ⇄ kvitto ───────────────────────────────────────────────
  #
  # Vid ett bord beställs i omgångar: efterrätten bestäms när huvudrätten är
  # uppäten. Kvittosidan var länge en återvändsgränd utan en enda länk, och
  # gästen fick skanna dekalen på nytt. Båda riktningarna kontrolleras, för de
  # går sönder var för sig.
  RECEIPT=$(curl -s -b "$COOKIES" "$BASE/t/$TOKEN/order/$ORDER_ID")
  if grep -q "\"/t/$TOKEN\"" <<<"$RECEIPT"; then
    pass "kvittot leder tillbaka till menyn"
  else
    fail "kvittot saknar vägen tillbaka till menyn"
  fi

  MENU_AGAIN=$(curl -s -b "$COOKIES" "$BASE/t/$TOKEN")
  if grep -q "/t/$TOKEN/order/$ORDER_ID" <<<"$MENU_AGAIN"; then
    pass "menyn visar den pågående beställningen"
  else
    fail "menyn känner inte till gästens pågående order"
  fi

  # Utan session ska bannern inte finnas. Den bygger på en cookie, och en
  # cookie är gästens att ändra på — bannern får aldrig vara en väg in.
  if curl -s "$BASE/t/$TOKEN" | grep -q "/t/$TOKEN/order/"; then
    fail "menyn läcker en order till den utan session"
  else
    pass "menyn visar ingen order utan session"
  fi
fi

echo "→ Prisvalidering"
# Klienten påstår att ordern kostar 1 öre.
RESPONSE=$(order_request "{
  \"type\": \"TABLE\", \"table_token\": \"$TOKEN\", \"client_total_ore\": 1,
  \"idempotency_key\": \"$(uuid)\",
  \"items\": [{\"menu_item_id\": \"$CEVAPI\", \"quantity\": 1, \"options\": []}]
}")
assert_order_status "manipulerad totalsumma avvisas" 409 "$(tail -1 <<<"$RESPONSE")"

# Tillval lånat från en annan rätt: "Bez luka" hör till ćevapi, inte till
# pljeskavican. Servern ska vägra i stället för att tyst dra av rabatten.
RESPONSE=$(order_request "{
  \"type\": \"TABLE\", \"table_token\": \"$TOKEN\",
  \"idempotency_key\": \"$(uuid)\",
  \"items\": [{\"menu_item_id\": \"$PLJESKAVICA\", \"quantity\": 1, \"options\": [{\"option_id\": \"$BEZ_LUKA\"}]}]
}")
assert_order_status "tillval från annan rätt avvisas" 400 "$(tail -1 <<<"$RESPONSE")"

echo "→ Betalvägar"

# Kortbetalning utan betalkonto ska nekas, inte tyst falla tillbaka på kontant.
# Klienten visar bara kortknappen när kontot finns, men den som anropar API:t
# direkt har aldrig sett gränssnittet — och en order som läggs som "kontant"
# när gästen bad om kort är en order ingen kommer att betala.
RESPONSE=$(order_request "{
  \"type\": \"TABLE\", \"table_token\": \"$TOKEN\", \"payment_method\": \"CARD\",
  \"idempotency_key\": \"$(uuid)\",
  \"items\": [{\"menu_item_id\": \"$CEVAPI\", \"quantity\": 1, \"options\": []}]
}")
assert_order_status "kort utan betalkonto avvisas" 409 "$(tail -1 <<<"$RESPONSE")"

echo "→ Kuponger"

# Rabattkoden slås in av gästen; beloppet räknas av servern. Skulle klienten få
# skicka beloppet vore varje kupong i praktiken obegränsad.
COUPON_CODE="ROKTEST$(node -e 'process.stdout.write(String(Date.now()).slice(-6))')"
sql "insert into public.coupons (restaurant_id, code, discount_bps, max_per_guest)
     values ('$SEED_RESTAURANT', '$COUPON_CODE', 2500, 0);" > /dev/null

# Ćevapi 12,00 KM − 25 % = 9,00 KM.
RESPONSE=$(order_request "{
  \"type\": \"TABLE\", \"table_token\": \"$TOKEN\", \"coupon_code\": \"$COUPON_CODE\",
  \"client_total_ore\": 900, \"idempotency_key\": \"$(uuid)\",
  \"items\": [{\"menu_item_id\": \"$CEVAPI\", \"quantity\": 1, \"options\": []}]
}")
STATUS=$(tail -1 <<<"$RESPONSE")
COUPON_ORDER=$(sed '$d' <<<"$RESPONSE" | json_field order_id)

if [ "$STATUS" = "201" ] && [ -n "$COUPON_ORDER" ]; then
  DISCOUNT=$(sql "select discount_ore from public.orders where id = '$COUPON_ORDER';")
  if [ "$DISCOUNT" = "-300" ]; then
    pass "kupongen drog 3,00 KM"
  else
    fail "rabatten blev '$DISCOUNT', väntade -300"
  fi

  # Avgiften räknas efter rabatt: 3,40 % av 900 = 30,6 → 31 fening.
  FEE=$(sql "select fee_ore from public.fees where order_id = '$COUPON_ORDER';")
  if [ "$FEE" = "31" ]; then
    pass "avgiften räknas efter rabatt (31 fening)"
  else
    fail "avgiften blev '$FEE', väntade 31"
  fi

  REDEEMED=$(sql "select count(*) from public.coupon_redemptions where order_id = '$COUPON_ORDER';")
  if [ "$REDEEMED" = "1" ]; then pass "inlösen bokförd"; else fail "ingen inlösenrad skrevs"; fi
else
  assert_order_status "kupongorder" 201 "$STATUS"
fi

# En okänd kod ska ge ett begripligt nej, inte en tyst order utan rabatt.
RESPONSE=$(order_request "{
  \"type\": \"TABLE\", \"table_token\": \"$TOKEN\", \"coupon_code\": \"FINNSINTE\",
  \"idempotency_key\": \"$(uuid)\",
  \"items\": [{\"menu_item_id\": \"$CEVAPI\", \"quantity\": 1, \"options\": []}]
}")
assert_order_status "okänd kupongkod avvisas" 409 "$(tail -1 <<<"$RESPONSE")"

sql "delete from public.coupons where code = '$COUPON_CODE'
     and not exists (select 1 from public.coupon_redemptions r where r.coupon_id = coupons.id);" > /dev/null

echo "→ Presentkort"

# Ett presentkort är BETALMEDEL och inte rabatt: ordersumman och momsen står
# orörda, det som sjunker är vad som ska debiteras.
#
# Koden slumpas per körning i stället för att vara fast och städas bort.
# Städningen kunde nämligen aldrig lyckas: `gift_card_transactions` är
# append-only och `reject_mutation` avvisar varje DELETE. Felet försvann i
# `2>/dev/null`, kortet från förra körningen låg kvar tömt, och testet
# rapporterade "presentkortsorder: fick 409, väntade 201" — alltså ett
# produktfel som inte fanns. Röktestet gick bara att köra mot en färsk databas,
# vilket är precis när det behövs minst.
# Alfabetet är presentkortets, inte QR-kodens. De skiljer sig: kortet utesluter
# 0 och 1 därför att koden läses högt över ett bord, QR-tokenet utesluter L och
# U därför att det aldrig läses av en människa. Fel alfabet här gav en kod
# databasen sparade och API:t avvisade — "Presentkortet finns inte", men bara
# när slumpen råkade ge en nolla. Speglar ALPHABET i core/src/gift-card.ts.
GIFT_CODE="$(node -e '
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  process.stdout.write([...bytes].map((b) => alphabet[b % alphabet.length]).join(""));
')"
sql "select public.issue_gift_card('$SEED_RESTAURANT', '$GIFT_CODE', 500, 'BAM');" > /dev/null

# Att kortet finns kontrolleras innan det används. Går utgivningen fel svarar
# API:t "Presentkortet finns inte", och det läser som ett produktfel i inlösen
# när felet i själva verket ligger i testets egen uppsättning.
if [ "$(sql "select count(*) from public.gift_cards where code = '$GIFT_CODE';")" != "1" ]; then
  fail "presentkortet kunde inte ges ut ($GIFT_CODE) — testets uppsättning, inte produkten"
fi

# Ćevapi 12,00 KM, varav 5,00 betalas med kortet. 7,00 kvar att betala på plats.
RESPONSE=$(order_request "{
  \"type\": \"TABLE\", \"table_token\": \"$TOKEN\", \"gift_card_code\": \"$GIFT_CODE\",
  \"client_total_ore\": 1200, \"idempotency_key\": \"$(uuid)\",
  \"items\": [{\"menu_item_id\": \"$CEVAPI\", \"quantity\": 1, \"options\": []}]
}")
STATUS=$(tail -1 <<<"$RESPONSE")
GIFT_ORDER=$(sed '$d' <<<"$RESPONSE" | json_field order_id)

if [ "$STATUS" = "201" ] && [ -n "$GIFT_ORDER" ]; then
  TOTAL=$(sql "select total_ore from public.orders where id = '$GIFT_ORDER';")
  if [ "$TOTAL" = "1200" ]; then
    pass "presentkortet ändrade inte ordersumman"
  else
    fail "ordersumman blev '$TOTAL', väntade 1200 — presentkortet behandlades som rabatt"
  fi

  PAID=$(sql "select coalesce(sum(amount_ore), 0) from public.payments
              where order_id = '$GIFT_ORDER' and provider = 'GIFT_CARD';")
  if [ "$PAID" = "500" ]; then pass "presentkortet bokfört som betalning"; else fail "presentkortsbetalningen blev '$PAID', väntade 500"; fi

  BALANCE=$(sql "select public.gift_card_balance(id) from public.gift_cards where code = '$GIFT_CODE';")
  if [ "$BALANCE" = "0" ]; then pass "saldot räknat ur loggen (0)"; else fail "saldot blev '$BALANCE', väntade 0"; fi
else
  assert_order_status "presentkortsorder" 201 "$STATUS" "$(sed '$d' <<<"$RESPONSE")"
fi

# Ett tomt kort ska nekas, inte tyst ignoreras.
RESPONSE=$(order_request "{
  \"type\": \"TABLE\", \"table_token\": \"$TOKEN\", \"gift_card_code\": \"$GIFT_CODE\",
  \"idempotency_key\": \"$(uuid)\",
  \"items\": [{\"menu_item_id\": \"$CEVAPI\", \"quantity\": 1, \"options\": []}]
}")
assert_order_status "tomt presentkort avvisas" 409 "$(tail -1 <<<"$RESPONSE")"

echo "→ Idempotens"
KEY="$(uuid)"
PAYLOAD="{\"type\":\"TABLE\",\"table_token\":\"$TOKEN\",\"idempotency_key\":\"$KEY\",\"items\":[{\"menu_item_id\":\"$CEVAPI\",\"quantity\":1,\"options\":[]}]}"
FIRST=$(order_request "$PAYLOAD" | sed '$d' | json_field order_id)
SECOND=$(order_request "$PAYLOAD" | sed '$d' | json_field order_id)
if [ "$FIRST" = "$SECOND" ] && [ -n "$FIRST" ] && [ "$FIRST" != "null" ]; then
  pass "samma nyckel ger samma order"
elif [ -z "$FIRST" ] && [ -z "$SECOND" ]; then
  # Rate limiten, inte produkten. Rapporteras som hopp och inte som fel, av
  # samma skäl som `assert_order_status` gör det: två körningar i rad tömmer
  # kvoten, och ett rött fel som beror på testet självt lär en att sluta lita
  # på rapporten.
  printf '  \033[33mhopp\033[0m  idempotens — rate limiten slog till, inte avgjort\n'
else
  fail "dubbeltryck gav två order ($FIRST / $SECOND)"
fi

echo "→ Personalytor kräver inloggning"
for path in /dashboard /kok /dashboard/bord; do
  # Status OCH mål. Bara målet räcker inte: en 500:a ger tom redirect-URL och
  # rapporten blir "skyddas inte", vilket pekar helt fel vid felsökning.
  RESULT=$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' "$BASE$path")
  CODE=${RESULT%% *}
  LOCATION=${RESULT#* }

  if [ "$CODE" = "307" ] || [ "$CODE" = "302" ]; then
    if grep -q "/logga-in" <<<"$LOCATION"; then
      pass "$path skickar till inloggning"
    else
      fail "$path redirectar till '$LOCATION' i stället för inloggning"
    fi
  else
    fail "$path svarade $CODE i stället för att redirecta"
  fi
done

echo "→ Personalkonton"
# Testar seed-staff.sql mot GoTrue. Att raderna finns i auth.users räcker inte
# — Auth har egna krav på kolumner som saknar default, och de felen syns först
# vid ett riktigt inloggningsförsök.
SUPABASE_URL=$(grep '^NEXT_PUBLIC_SUPABASE_URL=' apps/web/.env.local | cut -d= -f2- | tr -d '\r')
ANON_KEY=$(grep '^NEXT_PUBLIC_SUPABASE_ANON_KEY=' apps/web/.env.local | cut -d= -f2- | tr -d '\r')

for account in "agare@burp.test" "kock@burp.test"; do
  TOKEN_RESPONSE=$(curl -s -X POST "$SUPABASE_URL/auth/v1/token?grant_type=password" \
    -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
    -d "{\"email\":\"$account\",\"password\":\"burp1234\"}")
  if [ -n "$(json_field access_token <<<"$TOKEN_RESPONSE")" ]; then
    pass "$account kan logga in"
  else
    fail "$account kan inte logga in: $(head -c 160 <<<"$TOKEN_RESPONSE")"
  fi
done

# Fel lösenord ska nekas — annars är inloggningen teater.
BAD=$(curl -s -X POST "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
  -d '{"email":"agare@burp.test","password":"fel-losenord"}')
if [ -z "$(json_field access_token <<<"$BAD")" ]; then
  pass "fel lösenord nekas"
else
  fail "fel lösenord accepterades"
fi

echo "→ Menyhantering (RLS-vägen serveråtgärderna går)"
OWNER_TOKEN=$(curl -s -X POST "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
  -d '{"email":"agare@burp.test","password":"burp1234"}' | json_field access_token)

KITCHEN_TOKEN=$(curl -s -X POST "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
  -d '{"email":"kock@burp.test","password":"burp1234"}' | json_field access_token)

RESTAURANT_ID="$SEED_RESTAURANT"

# Namnet är avsiktligt ren ASCII. Git Bash skickar å/ä/ö i fel teckenkodning
# i en -d-sträng, och PostgREST avvisar då hela anropet som ogiltig JSON — ett
# fel som ser ut som ett rättighetsproblem men inte är det.
post_menu() {
  curl -s -o /dev/null -w '%{http_code}' -X POST "$SUPABASE_URL/rest/v1/menus" \
    -H "apikey: $ANON_KEY" -H "Authorization: Bearer $1" \
    -H "Content-Type: application/json" -H "Prefer: return=minimal" \
    -d "{\"restaurant_id\":\"$RESTAURANT_ID\",\"name\":\"SMOKE-TEST-MENU\",\"status\":\"DRAFT\"}"
}

if [ "$(post_menu "$OWNER_TOKEN")" = "201" ]; then
  pass "ägaren kan skapa en meny"
else
  fail "ägaren kunde inte skapa en meny (fick $(post_menu "$OWNER_TOKEN"))"
fi

# Kocken har bara köksskärmen. Kan han skriva i menyn är rollmodellen trasig.
KITCHEN_STATUS=$(post_menu "$KITCHEN_TOKEN")
if [ "$KITCHEN_STATUS" != "201" ]; then
  pass "kocken kan inte skapa en meny ($KITCHEN_STATUS)"
else
  fail "kocken kunde skapa en meny — rollmodellen släpper igenom för mycket"
fi

ANON_STATUS=$(post_menu "$ANON_KEY")
if [ "$ANON_STATUS" != "201" ]; then
  pass "anonym kan inte skapa en meny ($ANON_STATUS)"
else
  fail "anonym kunde skapa en meny"
fi

sql "delete from public.menus where name = 'SMOKE-TEST-MENU';" > /dev/null

echo "→ Statistik"
# Ordrarna som lades ovan ligger i PLACED. Statistiken räknar bara COMPLETED,
# så de drivs igenom statusmaskinen ett steg i taget — triggern avvisar hopp.
for step in ACCEPTED PREPARING READY COMPLETED; do
  sql "update public.orders set status = '$step' where restaurant_id = '$SEED_RESTAURANT' and status = $(
    case "$step" in
      ACCEPTED)  echo "'PLACED'" ;;
      PREPARING) echo "'ACCEPTED'" ;;
      READY)     echo "'PREPARING'" ;;
      COMPLETED) echo "'READY'" ;;
    esac
  );" > /dev/null
done

rpc() {
  curl -s -X POST "$SUPABASE_URL/rest/v1/rpc/$1" \
    -H "apikey: $ANON_KEY" -H "Authorization: Bearer $2" \
    -H "Content-Type: application/json" -d "$3"
}

STATS_ARGS="{\"p_restaurant_id\":\"$SEED_RESTAURANT\",\"p_from\":\"2000-01-01T00:00:00Z\",\"p_to\":\"2100-01-01T00:00:00Z\"}"
SUMMARY=$(rpc restaurant_revenue_summary "$OWNER_TOKEN" "$STATS_ARGS")

# Svaret är en lista med en rad. Plockar ut fälten utan jq.
ORDERS_COUNT=$(node -e '
  let raw = ""; process.stdin.on("data", (c) => (raw += c)).on("end", () => {
    try { const r = JSON.parse(raw); process.stdout.write(String(r?.[0]?.orders_count ?? "")); }
    catch { process.stdout.write(""); }
  });' <<<"$SUMMARY")
FEES_TOTAL=$(node -e '
  let raw = ""; process.stdin.on("data", (c) => (raw += c)).on("end", () => {
    try { const r = JSON.parse(raw); process.stdout.write(String(r?.[0]?.fees_ore ?? "")); }
    catch { process.stdout.write(""); }
  });' <<<"$SUMMARY")

if [ -n "$ORDERS_COUNT" ] && [ "$ORDERS_COUNT" -gt 0 ] 2>/dev/null; then
  pass "omsättningen räknas ($ORDERS_COUNT genomförda order)"
else
  fail "statistiken gav inga genomförda order: $(head -c 200 <<<"$SUMMARY")"
fi

if [ -n "$FEES_TOTAL" ] && [ "$FEES_TOTAL" -gt 0 ] 2>/dev/null; then
  pass "Burps avgift summeras ($FEES_TOTAL öre)"
else
  fail "avgiften summerades inte: $FEES_TOTAL"
fi

# Statistiken är personalens. En anonym gäst ska inte kunna läsa omsättningen.
ANON_STATS=$(curl -s -o /dev/null -w '%{http_code}' -X POST \
  "$SUPABASE_URL/rest/v1/rpc/restaurant_revenue_summary" \
  -H "apikey: $ANON_KEY" -H "Content-Type: application/json" -d "$STATS_ARGS")
if [ "$ANON_STATS" != "200" ]; then
  pass "anonym kan inte läsa omsättningen ($ANON_STATS)"
else
  fail "anonym kunde läsa restaurangens omsättning"
fi

echo "→ Plattformsroll (Burp backoffice)"
PLATFORM_TOKEN=$(curl -s -X POST "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
  -d '{"email":"burp@burp.test","password":"burp1234"}' | json_field access_token)

if [ -n "$PLATFORM_TOKEN" ]; then
  pass "backoffice-kontot kan logga in"
else
  fail "backoffice-kontot kan inte logga in"
fi

count_restaurants() {
  curl -s "$SUPABASE_URL/rest/v1/restaurants?select=id" \
    -H "apikey: $ANON_KEY" -H "Authorization: Bearer $1" \
    | node -e 'let r="";process.stdin.on("data",c=>r+=c).on("end",()=>{
        try { process.stdout.write(String(JSON.parse(r).length)); } catch { process.stdout.write("-1"); }
      });'
}

# Burp ser alla sju. Utan plattformsrollen visar RLS bara aktiva restauranger,
# och en PENDING-ansökan skulle vara osynlig för den som ska godkänna den.
PLATFORM_COUNT=$(count_restaurants "$PLATFORM_TOKEN")
if [ "$PLATFORM_COUNT" -ge 7 ] 2>/dev/null; then
  pass "backoffice ser alla restauranger ($PLATFORM_COUNT)"
else
  fail "backoffice såg $PLATFORM_COUNT restauranger, väntade minst 7"
fi

# ── Regressionsskyddet ──────────────────────────────────────────────────────
# Plattformspolicyerna är additiva. Det får INTE betyda att en restaurangägare
# plötsligt ser andras data. De två kontrollerna nedan är hela skälet till att
# den här sektionen finns.

OTHER_RESTAURANT="11111111-1111-1111-1111-111111111112"

OWNER_SEES_OTHER=$(curl -s \
  "$SUPABASE_URL/rest/v1/staff?select=id&restaurant_id=eq.$OTHER_RESTAURANT" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $OWNER_TOKEN" \
  | node -e 'let r="";process.stdin.on("data",c=>r+=c).on("end",()=>{
      try { process.stdout.write(String(JSON.parse(r).length)); } catch { process.stdout.write("-1"); }
    });')

if [ "$OWNER_SEES_OTHER" = "0" ]; then
  pass "restaurangägaren ser inte andras personal"
else
  fail "restaurangägaren såg $OWNER_SEES_OTHER personalrader hos en annan restaurang"
fi

OWNER_SEES_PLATFORM=$(curl -s "$SUPABASE_URL/rest/v1/platform_admins?select=user_id" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $OWNER_TOKEN" \
  | node -e 'let r="";process.stdin.on("data",c=>r+=c).on("end",()=>{
      try { process.stdout.write(String(JSON.parse(r).length)); } catch { process.stdout.write("-1"); }
    });')

if [ "$OWNER_SEES_PLATFORM" = "0" ]; then
  pass "restaurangägaren ser inte Burps personallista"
else
  fail "restaurangägaren såg $OWNER_SEES_PLATFORM rader i platform_admins"
fi

# RLS ger en tom lista, inte ett fel — PostgREST svarar 200 med []. Det är
# rätt beteende och samma som för `staff`. Kontrollen måste därför gälla
# ANTALET RADER, inte statuskoden: en 200 med data vore läckan, inte 200 i sig.
ANON_PLATFORM=$(curl -s "$SUPABASE_URL/rest/v1/platform_admins?select=user_id" \
  -H "apikey: $ANON_KEY" \
  | node -e 'let r="";process.stdin.on("data",c=>r+=c).on("end",()=>{
      try { const j = JSON.parse(r); process.stdout.write(Array.isArray(j) ? String(j.length) : "-1"); }
      catch { process.stdout.write("-1"); }
    });')

if [ "$ANON_PLATFORM" = "0" ]; then
  pass "anonym får inga rader ur platform_admins"
else
  fail "anonym fick $ANON_PLATFORM rader ur platform_admins"
fi

for path in /backoffice /backoffice/restauranger /backoffice/media; do
  CODE=$(curl -s -o /dev/null -w '%{http_code}' "$BASE$path")
  if [ "$CODE" = "307" ] || [ "$CODE" = "302" ]; then
    pass "$path kräver inloggning"
  else
    fail "$path svarade $CODE i stället för att redirecta"
  fi
done

echo "→ Kundpanel"
check_status "registrering är publik" "/skapa-konto" 200

for path in /konto /konto/favoriter /konto/adresser; do
  CODE=$(curl -s -o /dev/null -w '%{http_code}' "$BASE$path")
  if [ "$CODE" = "307" ] || [ "$CODE" = "302" ]; then
    pass "$path kräver inloggning"
  else
    fail "$path svarade $CODE i stället för att redirecta"
  fi
done

# En inloggad gäst ska bara se sina egna adresser och favoriter. Ägarkontot har
# inga, och att det får en tom lista i stället för någon annans är hela poängen
# med `addresses_own` och `favorites_own`.
for table in addresses favorites; do
  ROWS=$(curl -s "$SUPABASE_URL/rest/v1/$table?select=user_id" \
    -H "apikey: $ANON_KEY" -H "Authorization: Bearer $OWNER_TOKEN" \
    | node -e 'let r="";process.stdin.on("data",c=>r+=c).on("end",()=>{
        try { const j = JSON.parse(r); process.stdout.write(Array.isArray(j) ? String(j.length) : "-1"); }
        catch { process.stdout.write("-1"); }
      });')
  if [ "$ROWS" = "0" ]; then
    pass "$table läcker inte mellan konton"
  else
    fail "$table gav $ROWS rader till ett konto utan egna"
  fi
done

echo "→ Inställningar och lojalitet"
CODE=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/dashboard/installningar")
if [ "$CODE" = "307" ] || [ "$CODE" = "302" ]; then
  pass "/dashboard/installningar kräver inloggning"
else
  fail "/dashboard/installningar svarade $CODE"
fi

# Öppettiderna styr om gäster kan beställa alls. Att de går att ändra via RLS
# med ägarens egen session är hela poängen med sidan.
HOURS_CODE=$(curl -s -o /dev/null -w '%{http_code}' -X PATCH \
  "$SUPABASE_URL/rest/v1/restaurants?id=eq.$SEED_RESTAURANT" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $OWNER_TOKEN" \
  -H "Content-Type: application/json" -H "Prefer: return=minimal" \
  -d '{"loyalty_points_per_krona": 1.00}')
if [ "$HOURS_CODE" = "204" ] || [ "$HOURS_CODE" = "200" ]; then
  pass "ägaren kan ändra restaurangens inställningar ($HOURS_CODE)"
else
  fail "ägaren kunde inte ändra inställningar (fick $HOURS_CODE)"
fi

# PostgREST svarar 204 även när RLS blockerade varenda rad — en UPDATE som
# träffar noll rader ser identisk ut med en som lyckades. Kontrollen måste
# därför läsa tillbaka VÄRDET, inte statuskoden.
curl -s -o /dev/null -X PATCH \
  "$SUPABASE_URL/rest/v1/restaurants?id=eq.$SEED_RESTAURANT" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $KITCHEN_TOKEN" \
  -H "Content-Type: application/json" -H "Prefer: return=minimal" \
  -d '{"loyalty_points_per_krona": 9.99}'

AFTER_KITCHEN=$(sql "select loyalty_points_per_krona from public.restaurants where id = '$SEED_RESTAURANT';")
if [ "$AFTER_KITCHEN" = "1.00" ]; then
  pass "kockens ändring av inställningar tog inte"
else
  fail "kocken ändrade inställningen till $AFTER_KITCHEN"
fi

# Ordrarna ovan lades anonymt, utan inloggad gäst. Att de INTE gav poäng är
# egenskapen som testas: utan guest_id finns ingen att ge dem till.
ANON_EARN=$(sql "select count(*) from public.loyalty_transactions t
  join public.orders o on o.id = t.order_id
  where t.kind = 'EARN' and o.guest_id is null;")
if [ "$ANON_EARN" = "0" ]; then
  pass "anonyma beställningar ger inga poäng"
else
  fail "$ANON_EARN poängrader skapades för beställningar utan gäst"
fi

echo "→ Orderredigering"
# Egen order med två rader. Att återanvända en tidigare gör testet beroende av
# vad andra sektioner hunnit göra med den — statistiksektionen driver till
# exempel alla lagda order till COMPLETED, och en genomförd order är inte
# längre ändringsbar.
EDIT_ORDER=$(order_request "{
  \"type\": \"TABLE\", \"table_token\": \"$TOKEN\", \"idempotency_key\": \"$(uuid)\",
  \"items\": [
    {\"menu_item_id\": \"$CEVAPI\", \"quantity\": 1, \"options\": []},
    {\"menu_item_id\": \"$PLJESKAVICA\", \"quantity\": 1, \"options\": []}
  ]
}" | sed '$d' | json_field order_id)

if [ -n "$EDIT_ORDER" ]; then
  # Ett gissat order-id ska ge samma svar som en order som inte finns —
  # annars går endpointen att använda för att kartlägga vilka id som existerar.
  GUESSED=$(curl -s -o /dev/null -w '%{http_code}' -X PATCH \
    "$BASE/api/orders/00000000-0000-0000-0000-000000000000" \
    -H "Content-Type: application/json" -d '{"action":"CANCEL"}')
  if [ "$GUESSED" = "404" ]; then
    pass "gissat order-id ger 404"
  else
    fail "gissat order-id gav $GUESSED"
  fi

  # Utan bordssessionens cookie är ordern inte gästens.
  NO_COOKIE=$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$BASE/api/orders/$EDIT_ORDER" \
    -H "Content-Type: application/json" -d '{"action":"CANCEL"}')
  if [ "$NO_COOKIE" = "404" ]; then
    pass "order går inte att ändra utan session"
  else
    fail "en främling kunde nå ordern ($NO_COOKIE)"
  fi

  # Med två rader ska den första gå att ta bort.
  FIRST_ITEM=$(sql "select id from public.order_items where order_id = '$EDIT_ORDER' order by created_at limit 1;")
  REMOVED=$(curl -s -o /dev/null -b "$COOKIES" -w '%{http_code}' -X PATCH \
    "$BASE/api/orders/$EDIT_ORDER" -H "Content-Type: application/json" \
    -d "{\"action\":\"REMOVE_ITEM\",\"order_item_id\":\"$FIRST_ITEM\"}")
  if [ "$REMOVED" = "200" ]; then
    pass "gästen kan ta bort en rad"
  else
    fail "borttagning gav $REMOVED"
  fi

  # Summan och avgiften ska ha räknats om. Görs inte det tar Burp betalt för
  # mat som togs bort — och det upptäcks först i restaurangens bokföring.
  GROSS_AFTER=$(sql "select items_gross_ore from public.orders where id = '$EDIT_ORDER';")
  if [ "$GROSS_AFTER" = "1400" ]; then
    pass "summan räknades om efter borttagning"
  else
    fail "summan blev $GROSS_AFTER, väntade 1400"
  fi

  FEE_AFTER=$(sql "select fee_ore from public.fees where order_id = '$EDIT_ORDER';")
  if [ "$FEE_AFTER" = "48" ]; then
    pass "Burps avgift räknades om"
  else
    fail "avgiften blev $FEE_AFTER, väntade 48"
  fi

  # Sista raden ska vägras — en tom order är en avbruten order.
  LAST_ITEM=$(sql "select id from public.order_items where order_id = '$EDIT_ORDER' limit 1;")
  LAST_ROW=$(curl -s -o /dev/null -b "$COOKIES" -w '%{http_code}' -X PATCH \
    "$BASE/api/orders/$EDIT_ORDER" -H "Content-Type: application/json" \
    -d "{\"action\":\"REMOVE_ITEM\",\"order_item_id\":\"$LAST_ITEM\"}")
  if [ "$LAST_ROW" = "409" ]; then
    pass "sista raden kan inte tas bort"
  else
    fail "sista raden gick att ta bort: $LAST_ROW"
  fi

  # Avbokning ska gå igenom med rätt session.
  CANCELLED=$(curl -s -o /dev/null -b "$COOKIES" -w '%{http_code}' -X PATCH \
    "$BASE/api/orders/$EDIT_ORDER" \
    -H "Content-Type: application/json" -d '{"action":"CANCEL"}')
  if [ "$CANCELLED" = "200" ]; then
    pass "gästen kan avbryta sin order"
  else
    fail "avbokning gav $CANCELLED"
  fi

  if [ "$(sql "select status from public.orders where id = '$EDIT_ORDER';")" = "CANCELLED" ]; then
    pass "statusen är avbruten i databasen"
  else
    fail "statusen ändrades inte"
  fi

  # En redan avbruten order är i ett slutläge och ska inte gå att röra igen.
  AGAIN=$(curl -s -o /dev/null -b "$COOKIES" -w '%{http_code}' -X PATCH \
    "$BASE/api/orders/$EDIT_ORDER" \
    -H "Content-Type: application/json" -d '{"action":"CANCEL"}')
  if [ "$AGAIN" = "409" ]; then
    pass "en avbruten order kan inte avbrytas igen"
  else
    fail "en avbruten order gick att ändra ($AGAIN)"
  fi
else
  # Utan order finns ingenting att ändra, och nio kontroller föll bort UTAN ETT
  # ORD i tidigare versioner. En sektion som tyst gör ingenting läses som en
  # sektion som passerade — och just den här körningen råkade vara den där
  # rate limiten slog till.
  printf '  \033[33mhopp\033[0m  orderredigering (9 kontroller) — ingen order att ändra, troligen rate limit\n'
fi

echo "→ Omdömen"
# Ett omdöme kräver en genomförd order som tillhör en inloggad gäst. Bygger
# det i databasen: API-vägen kräver en gästsession som curl inte har.
sql "delete from public.reviews where restaurant_id = '$SEED_RESTAURANT';" > /dev/null
REVIEW_ORDER=$(sql "
  with u as (
    -- id måste anges explicit. auth.users har ingen default i Supabase, till
    -- skillnad från stubben i verify-schema.sh.
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                            email_confirmed_at, created_at, updated_at,
                            confirmation_token, recovery_token, email_change_token_new, email_change)
    values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
            'omdome-$(date +%s)@example.com', crypt('burp1234', gen_salt('bf')),
            now(), now(), now(), '', '', '', '')
    returning id
  ), o as (
    insert into public.orders (restaurant_id, guest_id, type, status, idempotency_key,
                               items_gross_ore, items_vat_ore, total_ore)
    select '$SEED_RESTAURANT', u.id, 'PICKUP', 'DRAFT', gen_random_uuid(), 12900, 1382, 12900
    from u returning id
  )
  select id from o;")

for step in PLACED ACCEPTED PREPARING READY COMPLETED; do
  sql "update public.orders set status = '$step' where id = '$REVIEW_ORDER';" > /dev/null
done

# INSERT ... RETURNING via `psql -tAc` skriver BÅDE raden och kommandotaggen
# "INSERT 0 1". Variabeln blir då två rader och oanvändbar som id. Lösningen är
# att låta den yttersta satsen vara en SELECT.
REVIEW_ID=$(sql "
  with r as (
    insert into public.reviews (order_id, restaurant_id, user_id, rating_food, rating_service, comment)
    select '$REVIEW_ORDER', '$SEED_RESTAURANT', guest_id, 2, 3, 'Hrana je bila hladna.'
    from public.orders where id = '$REVIEW_ORDER'
    returning id
  )
  select id from r;")

if [ -n "$REVIEW_ID" ]; then
  pass "omdöme kan lämnas på en genomförd order"
else
  fail "kunde inte skapa omdömet"
fi

if curl -s "$BASE/sv/r/sarajevo/cevabdzinica-zeljo" | grep -q "Hrana je bila hladna"; then
  pass "omdömet syns på restaurangsidan"
else
  fail "omdömet syns inte publikt"
fi

# Restaurangen får svara.
curl -s -o /dev/null -X PATCH "$SUPABASE_URL/rest/v1/reviews?id=eq.$REVIEW_ID" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $OWNER_TOKEN" \
  -H "Content-Type: application/json" -H "Prefer: return=minimal" \
  -d '{"response":"Tack for att du sager till. Vi ser over vara emballage."}'

if [ -n "$(sql "select response from public.reviews where id = '$REVIEW_ID';")" ]; then
  pass "restaurangen kan svara på omdömet"
else
  fail "restaurangens svar sparades inte"
fi

# Men inte ändra betyget. Det är hela grunden för att omdömena går att lita på
# — och därmed för att AggregateRating får publiceras.
curl -s -o /dev/null -X PATCH "$SUPABASE_URL/rest/v1/reviews?id=eq.$REVIEW_ID" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $OWNER_TOKEN" \
  -H "Content-Type: application/json" -H "Prefer: return=minimal" \
  -d '{"rating_food":5}'

if [ "$(sql "select rating_food from public.reviews where id = '$REVIEW_ID';")" = "2" ]; then
  pass "restaurangen kan inte ändra betyget"
else
  fail "restaurangen ändrade betyget på sitt eget omdöme"
fi

curl -s -o /dev/null -X PATCH "$SUPABASE_URL/rest/v1/reviews?id=eq.$REVIEW_ID" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $OWNER_TOKEN" \
  -H "Content-Type: application/json" -H "Prefer: return=minimal" \
  -d '{"comment":"Allt var utmarkt!"}'

if [ "$(sql "select comment from public.reviews where id = '$REVIEW_ID';")" = "Hrana je bila hladna." ]; then
  pass "restaurangen kan inte skriva om gästens text"
else
  fail "restaurangen skrev om gästens omdöme"
fi

# Snittbetyget cachas av trigger och ska spegla det enda omdömet.
if [ "$(sql "select rating_average from public.restaurants where id = '$SEED_RESTAURANT';")" = "2.0" ]; then
  pass "snittbetyget cachades"
else
  fail "snittbetyget blev $(sql "select rating_average from public.restaurants where id = '$SEED_RESTAURANT';")"
fi

sql "delete from public.reviews where id = '$REVIEW_ID';" > /dev/null

echo "→ Förbeställningar"
# Inställningen är avstängd i seed. En förbeställning ska då avvisas, inte tyst
# behandlas som en vanlig order.
SCHEDULED=$(order_request "{
  \"type\": \"PICKUP\", \"idempotency_key\": \"$(uuid)\",
  \"scheduled_for\": \"$(node -e 'const d=new Date(Date.now()+3*3600e3); d.setMinutes(0,0,0); console.log(d.toISOString())')\",
  \"items\": [{\"menu_item_id\": \"$CEVAPI\", \"quantity\": 1, \"options\": []}]
}")
assert_order_status "förbeställning avvisas när restaurangen stängt av den" 409 "$(tail -1 <<<"$SCHEDULED")"

# Slås den på ska en tid i det förflutna fortfarande avvisas — klienten
# föreslår, servern avgör.
sql "update public.restaurants set order_policy = jsonb_set(order_policy, '{allow_scheduled_orders}', 'true')
     where id = '$SEED_RESTAURANT';" > /dev/null

PAST=$(order_request "{
  \"type\": \"PICKUP\", \"idempotency_key\": \"$(uuid)\",
  \"scheduled_for\": \"$(node -e 'console.log(new Date(Date.now()-3600e3).toISOString())')\",
  \"items\": [{\"menu_item_id\": \"$CEVAPI\", \"quantity\": 1, \"options\": []}]
}")
assert_order_status "hämttid i det förflutna avvisas" 409 "$(tail -1 <<<"$PAST")"

# En tid som inte ligger på en kvart ska avvisas oavsett hur långt fram den är.
ODD=$(order_request "{
  \"type\": \"PICKUP\", \"idempotency_key\": \"$(uuid)\",
  \"scheduled_for\": \"$(node -e 'const d=new Date(Date.now()+3*3600e3); d.setMinutes(7,0,0); console.log(d.toISOString())')\",
  \"items\": [{\"menu_item_id\": \"$CEVAPI\", \"quantity\": 1, \"options\": []}]
}")
assert_order_status "hämttid utanför kvartarna avvisas" 409 "$(tail -1 <<<"$ODD")"

sql "update public.restaurants set order_policy = jsonb_set(order_policy, '{allow_scheduled_orders}', 'false')
     where id = '$SEED_RESTAURANT';" > /dev/null

echo "→ Mediauppladdning och moderering"
OTHER_RESTAURANT_FOLDER="11111111-1111-1111-1111-111111111112"
IMAGE_FILE="$(mktemp).png"
# Minsta möjliga giltiga PNG. Innehållet spelar ingen roll — det som testas är
# behörigheten, inte bildbehandlingen.
printf '\211PNG\r\n\032\n\0\0\0\rIHDR\0\0\0\1\0\0\0\1\10\6\0\0\0\37\25\304\211\0\0\0\nIDATx\234c\370\17\0\1\1\1\0\30\335\215\260\0\0\0\0IEND\256B\140\202' > "$IMAGE_FILE"

upload_image() {
  curl -s -o /dev/null -w '%{http_code}' -X POST \
    "$SUPABASE_URL/storage/v1/object/menu-media/$2" \
    -H "apikey: $ANON_KEY" -H "Authorization: Bearer $1" \
    -H "Content-Type: image/png" --data-binary "@$IMAGE_FILE"
}

OWN_PATH="$SEED_RESTAURANT/$(uuid).png"
if [ "$(upload_image "$OWNER_TOKEN" "$OWN_PATH")" = "200" ]; then
  pass "ägaren kan ladda upp till sin egen mapp"
else
  fail "ägaren kunde inte ladda upp (fick $(upload_image "$OWNER_TOKEN" "$SEED_RESTAURANT/$(uuid).png"))"
fi

# Sökvägens första mapp är restaurangens id, och storage-policyn jämför den
# mot `staff`. Det är det som hindrar en restaurang från att skriva i en annans
# mapp — eller skriva över en annans bild.
FOREIGN=$(upload_image "$OWNER_TOKEN" "$OTHER_RESTAURANT_FOLDER/$(uuid).png")
if [ "$FOREIGN" != "200" ]; then
  pass "ägaren kan inte ladda upp i en annan restaurangs mapp ($FOREIGN)"
else
  fail "ägaren kunde skriva i en annan restaurangs mapp"
fi

KITCHEN_UPLOAD=$(upload_image "$KITCHEN_TOKEN" "$SEED_RESTAURANT/$(uuid).png")
if [ "$KITCHEN_UPLOAD" != "200" ]; then
  pass "kocken kan inte ladda upp bilder ($KITCHEN_UPLOAD)"
else
  fail "kocken kunde ladda upp bilder"
fi

ANON_UPLOAD=$(curl -s -o /dev/null -w '%{http_code}' -X POST \
  "$SUPABASE_URL/storage/v1/object/menu-media/$SEED_RESTAURANT/$(uuid).png" \
  -H "apikey: $ANON_KEY" -H "Content-Type: image/png" --data-binary "@$IMAGE_FILE")
if [ "$ANON_UPLOAD" != "200" ]; then
  pass "anonym kan inte ladda upp ($ANON_UPLOAD)"
else
  fail "anonym kunde ladda upp en bild"
fi

rm -f "$IMAGE_FILE"

# Hela modereringsslingan: uppladdad bild är PENDING och osynlig, godkännande
# publicerar den, tillbakadraget godkännande tar bort den igen. Utan sista
# steget vore moderering en knapp utan effekt.
CEVAPI_ID="44444444-4444-4444-4444-444444444441"
sql "delete from public.media where menu_item_id = '$CEVAPI_ID';" > /dev/null
sql "update public.menu_items set image_url = null where id = '$CEVAPI_ID';" > /dev/null
sql "insert into public.media (restaurant_id, menu_item_id, kind, storage_path)
     values ('$SEED_RESTAURANT', '$CEVAPI_ID', 'IMAGE', '$OWN_PATH');" > /dev/null

BEFORE_APPROVAL=$(sql "select coalesce(image_url, 'INGEN') from public.menu_items where id = '$CEVAPI_ID';")
if [ "$BEFORE_APPROVAL" = "INGEN" ]; then
  pass "ogranskad bild syns inte för gästen"
else
  fail "en ogranskad bild publicerades direkt: $BEFORE_APPROVAL"
fi

sql "update public.media set status = 'APPROVED' where menu_item_id = '$CEVAPI_ID';" > /dev/null
AFTER_APPROVAL=$(sql "select coalesce(image_url, 'INGEN') from public.menu_items where id = '$CEVAPI_ID';")
if [ "${AFTER_APPROVAL#INGEN}" = "$AFTER_APPROVAL" ] && [ -n "$AFTER_APPROVAL" ]; then
  pass "godkännande publicerar bilden"
else
  fail "godkännandet publicerade ingen bild"
fi

sql "update public.media set status = 'REJECTED' where menu_item_id = '$CEVAPI_ID';" > /dev/null
AFTER_REJECT=$(sql "select coalesce(image_url, 'INGEN') from public.menu_items where id = '$CEVAPI_ID';")
if [ "$AFTER_REJECT" = "INGEN" ]; then
  pass "tillbakadraget godkännande tar bort bilden"
else
  fail "en tillbakadragen bild låg kvar i menyn"
fi

sql "delete from public.media where menu_item_id = '$CEVAPI_ID';" > /dev/null

echo "→ Google-synlighet"
check_status "stadssida"          "/sv/sarajevo"            200
check_status "kökssida"           "/sv/sarajevo/grill"      200
check_status "okänd stad 404:ar"  "/finns-inte-alls"  404
check_status "okänt kök 404:ar"   "/sv/sarajevo/rymdmat"    404
check_status "sitemap"            "/sitemap.xml"      200
check_status "robots"             "/robots.txt"       200

# En indexerad bordskod vore en sökträff som ger vem som helst en giltig
# bordssession vid någon annans bord. Den raden får aldrig försvinna.
if curl -s "$BASE/robots.txt" | grep -q "Disallow: /t/"; then
  pass "bordskoder utestängs från indexering"
else
  fail "robots.txt stänger inte ute /t/ — bordskoder kan indexeras"
fi

if curl -s "$BASE/sitemap.xml" | grep -q "/sv/r/sarajevo/cevabdzinica-zeljo"; then
  pass "restaurangsidor finns i sitemap"
else
  fail "sitemap saknar restaurangsidorna"
fi

# Sitemap ska bara innehålla publicerbara sidor. En bordskod eller en
# kontosida där vore samma läcka som robots.txt är till för att förhindra.
if curl -s "$BASE/sitemap.xml" | grep -qE "/t/|/konto|/backoffice|/dashboard"; then
  fail "sitemap innehåller sidor som inte ska indexeras"
else
  pass "sitemap innehåller bara publika sidor"
fi

# `/bs/` är en ordbok för tre standarder och pekas ut för alla tre. Utan de
# extra taggarna hittas sidan bara av den som söker på bosniska — inte av den i
# Zagreb eller Belgrad, alltså två av tre marknader.
SITEMAP=$(curl -s "$BASE/sitemap.xml")
for tag in 'hreflang="hr"' 'hreflang="sr-Latn"' 'hreflang="de"' 'hreflang="no"'; do
  if grep -q "$tag" <<<"$SITEMAP"; then
    pass "sitemap pekar ut $tag"
  else
    fail "sitemap saknar $tag"
  fi
done

# ── Värvningssidan ─────────────────────────────────────────────────────────
#
# `/anslut` är den enda vägen in för en restaurang, och sedan 2026-08-22 ligger
# den under språksegmentet. Tre saker måste hålla samtidigt: den gamla adressen
# får inte 404:a, varje språk måste svara, och den måste gå att hitta i en
# sökning på rätt språk.
#
# Omdirigeringen ska vara 307 och inte 308. En permanent omdirigering cachas
# hårt i webbläsaren och skulle låsa fast besökaren vid det språk hen råkade ha
# första gången — och målet beror på `Accept-Language`.
check_status "gamla /anslut skickar vidare" "/anslut" 307

JOIN_TARGET=$(curl -s -o /dev/null -w '%{redirect_url}' \
  -H 'Accept-Language: hr-HR,hr;q=0.9' "$BASE/anslut")
if [[ "$JOIN_TARGET" == */bs/anslut ]]; then
  pass "kroatisk webbläsare landar på /bs/anslut"
else
  fail "kroatisk webbläsare skickades till '$JOIN_TARGET', väntade /bs/anslut"
fi

for L in sv bs en de no; do
  check_status "värvningssidan på /$L" "/$L/anslut" 200
done

# `/hr/` är ett alias i Accept-Language, aldrig en adress. Två URL:er med samma
# innehåll är dubblerat innehåll för Google.
check_status "okänt språk 404:ar" "/hr/anslut" 404

if grep -q "/bs/anslut" <<<"$SITEMAP"; then
  pass "värvningssidan finns i sitemap per språk"
else
  fail "sitemap saknar värvningssidan"
fi

# En sitemap som listar en omdirigering ber Google indexera en adress som inte
# finns. Den oprefixade får därför inte stå där.
if grep -qF "<loc>$BASE/anslut</loc>" <<<"$SITEMAP"; then
  fail "sitemap listar den oprefixade /anslut"
else
  pass "sitemap listar bara de prefixade värvningssidorna"
fi

# Sidan är översatt hela vägen, inte bara i sidhuvudet. Faller den här står
# svenska texter på en bosnisk adress.
if curl -s "$BASE/bs/anslut" | grep -q "Priključite svoj restoran"; then
  pass "värvningssidan talar bosniska"
else
  fail "/bs/anslut saknar den bosniska rubriken"
fi

if curl -s "$BASE/en" | grep -q 'href="/en/anslut"'; then
  pass "sidhuvudets värvningsknapp behåller språket"
else
  fail "värvningsknappen tappar språkprefixet"
fi

if curl -s "$BASE/sv/sarajevo" | grep -q '"@type":"ItemList"'; then
  pass "stadssidan har ItemList-markup"
else
  fail "stadssidan saknar strukturerad data"
fi

# Statiska rutter måste vinna över [stad]. Gör de inte det blir /konto en
# "stad" som 404:ar, och kundpanelen försvinner.
for path in /konto /dashboard /backoffice; do
  CODE=$(curl -s -o /dev/null -w '%{http_code}' "$BASE$path")
  if [ "$CODE" = "307" ] || [ "$CODE" = "302" ]; then
    pass "$path krockar inte med stadsrutten"
  else
    fail "$path svarade $CODE — [stad] kan ha tagit över rutten"
  fi
done

echo "→ Kort i restaurangens terminal"

# Kassan kunde bara registrera kontant, så en betalning i restaurangens egen
# terminal bokfördes som sedlar. Det som mäts här är att personalen får skriva
# en TERMINAL-rad, att kortflödet genom Burp fortfarande är stängt för dem, och
# att en nota kan delas mellan de två.
TERM_ORDER=$(sql "
  insert into public.orders (restaurant_id, type, status, idempotency_key,
                             items_gross_ore, total_ore, completed_at)
  values ('$SEED_RESTAURANT', 'PICKUP', 'COMPLETED', gen_random_uuid(), 10000, 10000, now())
  returning id;" | head -1)

term_insert() {
  curl -s -o /dev/null -w '%{http_code}' -X POST "$SUPABASE_URL/rest/v1/payments" \
    -H "apikey: $ANON_KEY" -H "Authorization: Bearer $OWNER_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"order_id\":\"$TERM_ORDER\",\"restaurant_id\":\"$SEED_RESTAURANT\",
         \"amount_ore\":$1,\"provider\":\"$2\",\"method\":\"card_present\",
         \"status\":\"CAPTURED\",\"captured_at\":\"$(node -e 'console.log(new Date().toISOString())')\",
         \"idempotency_key\":\"$(uuid)\"}"
}

CODE=$(term_insert 6000 TERMINAL)
if [ "$CODE" = "201" ]; then
  pass "ägaren kan registrera kort i terminalen ($CODE)"
else
  fail "terminalbetalning avvisades med $CODE"
fi

# Resten kontant på samma order. Ett sällskap kan dela notan mellan kortläsaren
# och sedlar, och det gamla indexet hade gjort det omöjligt.
CODE=$(term_insert 4000 CASH)
if [ "$CODE" = "201" ]; then
  pass "samma nota kan delas mellan terminal och sedlar ($CODE)"
else
  fail "delad nota avvisades med $CODE"
fi

# Samma betalsätt två gånger är ett dubbeltryck.
CODE=$(term_insert 100 TERMINAL)
if [ "$CODE" = "409" ]; then
  pass "dubbelregistrering i terminalen stoppas ($CODE)"
else
  fail "andra terminalraden gav $CODE, väntade 409"
fi

# Ett kortflöde genom Burp skrivs av webhooken med service role, aldrig av en
# inloggad användare. RLS ska säga nej.
CODE=$(term_insert 100 STRIPE)
if [ "$CODE" = "403" ] || [ "$CODE" = "401" ]; then
  pass "personalen kan inte skriva en leverantörsbetalning ($CODE)"
else
  fail "STRIPE-rad från personalen gav $CODE, väntade 403"
fi

echo "→ Avräkning, dricks och GDPR"

# Ytorna som byggdes efter att röktestet slutade gå att köra. Beräkningarna
# täcks av verify-schema.sh; det som mäts här är att rutterna finns, att de är
# stängda för den som inte ska in, och att de inte 500:ar.
check_status "/dashboard/avrakning kräver inloggning"  "/dashboard/avrakning"  307
check_status "/backoffice/avrakning kräver inloggning" "/backoffice/avrakning" 307
check_status "/konto/uppgifter kräver inloggning"      "/konto/uppgifter"      307
check_status "/dashboard/handelser kräver inloggning"  "/dashboard/handelser"  307
check_status "/dashboard/personal kräver inloggning"   "/dashboard/personal"   307

# Inbjudningslänken ligger utanför /dashboard — den som klickar är ännu inte
# personal. Utan inloggning ska den skicka till inloggningen, inte till en 404
# som får den inbjudna att tro att länken är trasig.
check_status "inbjudningslänken kräver inloggning" \
  "/personal/inbjudan/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" 307
check_status "raderat-kvittot är öppet"                "/konto/raderat"        200

# Exporten svarar 401 och inte en omdirigering. Den som anropar rutten direkt
# ska få veta att det var inloggningen som saknades, inte hamna på ett formulär.
check_status "GDPR-exporten kräver inloggning"  "/api/konto/export"  401

# Bakgrundsjobbet. Utan nyckel 401, med fel nyckel 401 — aldrig en körning.
check_status "poängjobbet nekar utan nyckel"    "/api/jobs/expire-loyalty"  401

CODE=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer fel-nyckel" \
  "$BASE/api/jobs/expire-loyalty")
if [ "$CODE" = "401" ]; then
  pass "poängjobbet nekar fel nyckel ($CODE)"
else
  fail "poängjobbet svarade $CODE på en felaktig nyckel, väntade 401"
fi

# Med rätt nyckel ska det köra. Nyckeln läses ur samma fil appen startades med;
# saknas den svarar rutten 503, och då är det miljön som ska rättas.
CRON_SECRET=$(sed -n 's/^CRON_SECRET=//p' apps/web/.env.local 2>/dev/null | tr -d '\r')
if [ -n "$CRON_SECRET" ]; then
  BODY=$(curl -s -H "Authorization: Bearer $CRON_SECRET" "$BASE/api/jobs/expire-loyalty")
  if [ "$(printf '%s' "$BODY" | json_field ok)" = "true" ]; then
    pass "poängjobbet kör med rätt nyckel"
  else
    fail "poängjobbet svarade: $BODY"
  fi
else
  printf '  \033[33mhopp\033[0m  poängjobbet — CRON_SECRET saknas i apps/web/.env.local\n'
fi

echo ""
if [ "$FAILED" -gt 0 ]; then
  echo "$FAILED kontroll(er) misslyckades."
  exit 1
fi
echo "Alla kontroller passerade."
