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

sql() { MSYS_NO_PATHCONV=1 docker run --rm -i "$PG_IMAGE" psql "$DB" -tAc "$1" 2>/dev/null | tr -d '\r'; }

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

trap 'rm -f "$COOKIES"' EXIT

echo "→ Publika sidor"
check_status "startsidan"            "/"                          200
check_status "hälsokontroll"         "/api/health"                200
check_status "restaurangsida (SEO)"  "/r/malmo/pizzeria-roma"     200
check_status "okänd restaurang"      "/r/malmo/finns-inte"        404
check_status "påhittat bordstoken"   "/t/AAAAAAAAAA"              404

if curl -s "$BASE/api/health" | grep -q '"database":"ok"'; then
  pass "databasen nås"
else
  fail "databasen nås inte — kör npx supabase start"
  echo "  (avbryter, resten kräver databas)"
  exit 1
fi

if curl -s "$BASE/r/malmo/pizzeria-roma" | grep -q '"@type":"Restaurant"'; then
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
if grep -q "Margherita" <<<"$QR_PAGE"; then pass "menyn renderas vid bordet"; else fail "menyn saknas på QR-sidan"; fi
if grep -q "Extra tillbehör" <<<"$QR_PAGE"; then pass "tillvalsgrupper renderas"; else fail "tillvalsgrupper saknas"; fi

# Ingen bordssession ska ha skapats av att sidan bara lästes. Notan öppnas
# när gästen beställer — inte när någon råkar skanna koden i förbifarten.
if grep -q "burp_table_session" "$COOKIES"; then
  fail "bordssession skapades redan vid skanning"
else
  pass "ingen nota öppnas av enbart en skanning"
fi

echo "→ Beställning"
MARGHERITA="44444444-4444-4444-4444-444444444441"
EXTRA_OST=$(sql "select id from public.options where name = 'Extra ost';")
UTAN_OST=$(sql "select id from public.options where name = 'Utan ost';")
DIAVOLA="44444444-4444-4444-4444-444444444442"

order_request() {
  curl -s -b "$COOKIES" -c "$COOKIES" -X POST "$BASE/api/orders" \
    -H "Content-Type: application/json" -d "$1" -w '\n%{http_code}'
}

# 129,00 + 15,00 extra ost = 144,00 kr, plus 10 kr dricks = 154,00
RESPONSE=$(order_request "{
  \"type\": \"TABLE\", \"table_token\": \"$TOKEN\", \"tip_ore\": 1000,
  \"client_total_ore\": 15400, \"idempotency_key\": \"$(uuid)\",
  \"items\": [{\"menu_item_id\": \"$MARGHERITA\", \"quantity\": 1, \"options\": [{\"option_id\": \"$EXTRA_OST\"}], \"note\": \"utan basilika\"}]
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

# Avgiften ska ha skrivits: 3,40 % av 14400 = 490 öre.
if [ -n "$ORDER_ID" ]; then
  FEE=$(sql "select fee_ore from public.fees where order_id = '$ORDER_ID';")
  if [ "$FEE" = "490" ]; then pass "Burps avgift beräknad och sparad (490 öre)"; else fail "avgiften blev '$FEE', väntade 490"; fi

  TIP=$(sql "select amount_ore from public.tips where order_id = '$ORDER_ID';")
  if [ "$TIP" = "1000" ]; then pass "dricksen sparad separat"; else fail "dricksen blev '$TIP', väntade 1000"; fi

  EVENTS=$(sql "select count(*) from public.order_events where order_id = '$ORDER_ID';")
  if [ "$EVENTS" -ge 1 ]; then pass "händelseloggen skriven"; else fail "ingen händelse loggad"; fi

  check_status_as_guest "kvittosidan" "/t/$TOKEN/order/$ORDER_ID" 200

  # Utan bordssessionens cookie ska ordern inte gå att läsa. Annars räcker det
  # att gissa ett order-id för att se en främlings nota.
  check_status "kvittot är stängt utan session" "/t/$TOKEN/order/$ORDER_ID" 404
fi

echo "→ Prisvalidering"
# Klienten påstår att ordern kostar 1 öre.
RESPONSE=$(order_request "{
  \"type\": \"TABLE\", \"table_token\": \"$TOKEN\", \"client_total_ore\": 1,
  \"idempotency_key\": \"$(uuid)\",
  \"items\": [{\"menu_item_id\": \"$MARGHERITA\", \"quantity\": 1, \"options\": []}]
}")
assert_order_status "manipulerad totalsumma avvisas" 409 "$(tail -1 <<<"$RESPONSE")"

# Tillval lånat från en annan rätt: "Utan ost" (-10 kr) hör till Margherita.
RESPONSE=$(order_request "{
  \"type\": \"TABLE\", \"table_token\": \"$TOKEN\",
  \"idempotency_key\": \"$(uuid)\",
  \"items\": [{\"menu_item_id\": \"$DIAVOLA\", \"quantity\": 1, \"options\": [{\"option_id\": \"$UTAN_OST\"}]}]
}")
assert_order_status "tillval från annan rätt avvisas" 400 "$(tail -1 <<<"$RESPONSE")"

echo "→ Idempotens"
KEY="$(uuid)"
PAYLOAD="{\"type\":\"TABLE\",\"table_token\":\"$TOKEN\",\"idempotency_key\":\"$KEY\",\"items\":[{\"menu_item_id\":\"$MARGHERITA\",\"quantity\":1,\"options\":[]}]}"
FIRST=$(order_request "$PAYLOAD" | sed '$d' | json_field order_id)
SECOND=$(order_request "$PAYLOAD" | sed '$d' | json_field order_id)
if [ "$FIRST" = "$SECOND" ] && [ -n "$FIRST" ] && [ "$FIRST" != "null" ]; then
  pass "samma nyckel ger samma order"
elif [ -z "$FIRST" ] && [ -z "$SECOND" ]; then
  fail "idempotens: inga order skapades, troligen rate limit. Vänta en minut."
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
    {\"menu_item_id\": \"$MARGHERITA\", \"quantity\": 1, \"options\": []},
    {\"menu_item_id\": \"$DIAVOLA\", \"quantity\": 1, \"options\": []}
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
  if [ "$GROSS_AFTER" = "14900" ]; then
    pass "summan räknades om efter borttagning"
  else
    fail "summan blev $GROSS_AFTER, väntade 14900"
  fi

  FEE_AFTER=$(sql "select fee_ore from public.fees where order_id = '$EDIT_ORDER';")
  if [ "$FEE_AFTER" = "507" ]; then
    pass "Burps avgift räknades om"
  else
    fail "avgiften blev $FEE_AFTER, väntade 507"
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
    select '$REVIEW_ORDER', '$SEED_RESTAURANT', guest_id, 2, 3, 'Maten var kall nar jag kom hem.'
    from public.orders where id = '$REVIEW_ORDER'
    returning id
  )
  select id from r;")

if [ -n "$REVIEW_ID" ]; then
  pass "omdöme kan lämnas på en genomförd order"
else
  fail "kunde inte skapa omdömet"
fi

if curl -s "$BASE/r/malmo/pizzeria-roma" | grep -q "Maten var kall"; then
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

if [ "$(sql "select comment from public.reviews where id = '$REVIEW_ID';")" = "Maten var kall nar jag kom hem." ]; then
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
  \"items\": [{\"menu_item_id\": \"$MARGHERITA\", \"quantity\": 1, \"options\": []}]
}")
assert_order_status "förbeställning avvisas när restaurangen stängt av den" 409 "$(tail -1 <<<"$SCHEDULED")"

# Slås den på ska en tid i det förflutna fortfarande avvisas — klienten
# föreslår, servern avgör.
sql "update public.restaurants set order_policy = jsonb_set(order_policy, '{allow_scheduled_orders}', 'true')
     where id = '$SEED_RESTAURANT';" > /dev/null

PAST=$(order_request "{
  \"type\": \"PICKUP\", \"idempotency_key\": \"$(uuid)\",
  \"scheduled_for\": \"$(node -e 'console.log(new Date(Date.now()-3600e3).toISOString())')\",
  \"items\": [{\"menu_item_id\": \"$MARGHERITA\", \"quantity\": 1, \"options\": []}]
}")
assert_order_status "hämttid i det förflutna avvisas" 409 "$(tail -1 <<<"$PAST")"

# En tid som inte ligger på en kvart ska avvisas oavsett hur långt fram den är.
ODD=$(order_request "{
  \"type\": \"PICKUP\", \"idempotency_key\": \"$(uuid)\",
  \"scheduled_for\": \"$(node -e 'const d=new Date(Date.now()+3*3600e3); d.setMinutes(7,0,0); console.log(d.toISOString())')\",
  \"items\": [{\"menu_item_id\": \"$MARGHERITA\", \"quantity\": 1, \"options\": []}]
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
MARGHERITA_ID="44444444-4444-4444-4444-444444444441"
sql "delete from public.media where menu_item_id = '$MARGHERITA_ID';" > /dev/null
sql "update public.menu_items set image_url = null where id = '$MARGHERITA_ID';" > /dev/null
sql "insert into public.media (restaurant_id, menu_item_id, kind, storage_path)
     values ('$SEED_RESTAURANT', '$MARGHERITA_ID', 'IMAGE', '$OWN_PATH');" > /dev/null

BEFORE_APPROVAL=$(sql "select coalesce(image_url, 'INGEN') from public.menu_items where id = '$MARGHERITA_ID';")
if [ "$BEFORE_APPROVAL" = "INGEN" ]; then
  pass "ogranskad bild syns inte för gästen"
else
  fail "en ogranskad bild publicerades direkt: $BEFORE_APPROVAL"
fi

sql "update public.media set status = 'APPROVED' where menu_item_id = '$MARGHERITA_ID';" > /dev/null
AFTER_APPROVAL=$(sql "select coalesce(image_url, 'INGEN') from public.menu_items where id = '$MARGHERITA_ID';")
if [ "${AFTER_APPROVAL#INGEN}" = "$AFTER_APPROVAL" ] && [ -n "$AFTER_APPROVAL" ]; then
  pass "godkännande publicerar bilden"
else
  fail "godkännandet publicerade ingen bild"
fi

sql "update public.media set status = 'REJECTED' where menu_item_id = '$MARGHERITA_ID';" > /dev/null
AFTER_REJECT=$(sql "select coalesce(image_url, 'INGEN') from public.menu_items where id = '$MARGHERITA_ID';")
if [ "$AFTER_REJECT" = "INGEN" ]; then
  pass "tillbakadraget godkännande tar bort bilden"
else
  fail "en tillbakadragen bild låg kvar i menyn"
fi

sql "delete from public.media where menu_item_id = '$MARGHERITA_ID';" > /dev/null

echo "→ Google-synlighet"
check_status "stadssida"          "/malmo"            200
check_status "kökssida"           "/malmo/tacos"      200
check_status "okänd stad 404:ar"  "/finns-inte-alls"  404
check_status "okänt kök 404:ar"   "/malmo/rymdmat"    404
check_status "sitemap"            "/sitemap.xml"      200
check_status "robots"             "/robots.txt"       200

# En indexerad bordskod vore en sökträff som ger vem som helst en giltig
# bordssession vid någon annans bord. Den raden får aldrig försvinna.
if curl -s "$BASE/robots.txt" | grep -q "Disallow: /t/"; then
  pass "bordskoder utestängs från indexering"
else
  fail "robots.txt stänger inte ute /t/ — bordskoder kan indexeras"
fi

if curl -s "$BASE/sitemap.xml" | grep -q "/r/malmo/pizzeria-roma"; then
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

if curl -s "$BASE/malmo" | grep -q '"@type":"ItemList"'; then
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

echo ""
if [ "$FAILED" -gt 0 ]; then
  echo "$FAILED kontroll(er) misslyckades."
  exit 1
fi
echo "Alla kontroller passerade."
