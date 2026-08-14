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
if [ "$(tail -1 <<<"$RESPONSE")" = "409" ]; then
  pass "manipulerad totalsumma avvisas"
else
  fail "manipulerad totalsumma accepterades: $(tail -1 <<<"$RESPONSE")"
fi

# Tillval lånat från en annan rätt: "Utan ost" (-10 kr) hör till Margherita.
RESPONSE=$(order_request "{
  \"type\": \"TABLE\", \"table_token\": \"$TOKEN\",
  \"idempotency_key\": \"$(uuid)\",
  \"items\": [{\"menu_item_id\": \"$DIAVOLA\", \"quantity\": 1, \"options\": [{\"option_id\": \"$UTAN_OST\"}]}]
}")
if [ "$(tail -1 <<<"$RESPONSE")" = "400" ]; then
  pass "tillval från annan rätt avvisas"
else
  fail "tillval från annan rätt accepterades: $(tail -1 <<<"$RESPONSE")"
fi

echo "→ Idempotens"
KEY="$(uuid)"
PAYLOAD="{\"type\":\"TABLE\",\"table_token\":\"$TOKEN\",\"idempotency_key\":\"$KEY\",\"items\":[{\"menu_item_id\":\"$MARGHERITA\",\"quantity\":1,\"options\":[]}]}"
FIRST=$(order_request "$PAYLOAD" | sed '$d' | json_field order_id)
SECOND=$(order_request "$PAYLOAD" | sed '$d' | json_field order_id)
if [ "$FIRST" = "$SECOND" ] && [ -n "$FIRST" ] && [ "$FIRST" != "null" ]; then
  pass "samma nyckel ger samma order"
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

echo ""
if [ "$FAILED" -gt 0 ]; then
  echo "$FAILED kontroll(er) misslyckades."
  exit 1
fi
echo "Alla kontroller passerade."
