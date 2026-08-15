#!/usr/bin/env bash
#
# Kör hela schemat mot en riktig PostgreSQL och kontrollerar att det faktiskt
# fungerar — inte bara att det går att parsa.
#
# `npm run db:validate` kontrollerar syntax, men kroppen i en plpgsql-funktion
# är en strängliteral för SQL-parsern och granskas inte alls. Just där bodde
# båda felen som hittades manuellt i migration 0010. Det här skriptet kör
# funktionerna på riktigt.
#
# Kräver en lokal PostgreSQL med PostGIS. Behöver INTE Docker eller Supabase.
#
#     bash scripts/verify-schema.sh
#
# Supabase-specifika saker som inte finns i en vanlig Postgres — schemat `auth`,
# funktionen auth.uid() och rollerna anon/authenticated/service_role — stubbas
# nedan. Stubbarna är medvetet minimala: de ska räcka för att schemat ska gå
# att skapa, inte efterlikna Supabase Auth.

set -euo pipefail

DB_NAME="${DB_NAME:-burp_verify}"
PSQL="psql -v ON_ERROR_STOP=1 --quiet --no-psqlrc"

cd "$(dirname "$0")/.."

echo "→ Skapar ren databas: $DB_NAME"
dropdb --if-exists "$DB_NAME"
createdb "$DB_NAME"

echo "→ Stubbar Supabase-specifika objekt"
$PSQL -d "$DB_NAME" <<'SQL'
create schema if not exists auth;
create schema if not exists extensions;
create schema if not exists storage;

-- Rollerna RLS-policyerna refererar till.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end
$$;

-- Minimal auth.users. Migrationerna har FK hit och en trigger på insert.
--
-- `id` har medvetet INGEN default, precis som i Supabase där GoTrue sätter
-- den. Stubben hade en förut, och då passerade tester som utelämnade id:t här
-- men föll mot en riktig instans. En stub som är mer tillåtande än
-- verkligheten är värre än ingen stub alls — den ger falskt grönt.
create table if not exists auth.users (
  id                  uuid primary key,
  email               text,
  raw_user_meta_data  jsonb not null default '{}'::jsonb
);

-- I Supabase läser auth.uid() användarens id ur JWT:n. Här läser den en
-- session-variabel så att RLS går att testa genom att sätta den.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

-- Minimal Storage. Migration 0017 skapar en bucket och policies på objects;
-- stubbarna finns för att den ska gå att köra, inte för att härma Storage.
create table if not exists storage.buckets (
  id                  text primary key,
  name                text not null,
  public              boolean not null default false,
  file_size_limit     bigint,
  allowed_mime_types  text[]
);

create table if not exists storage.objects (
  id         uuid primary key default gen_random_uuid(),
  bucket_id  text references storage.buckets(id),
  name       text not null,
  owner      uuid
);

alter table storage.objects enable row level security;

-- Delar sökvägen i mappar. Supabase har en riktig implementation; den här
-- räcker för att policyerna ska gå att skapa och för att första mappnivån
-- (restaurangens id) ska gå att läsa ut.
create or replace function storage.foldername(name text)
returns text[]
language sql
immutable
as $$
  select string_to_array(name, '/');
$$;
SQL

echo "→ Kör migrations"
for file in supabase/migrations/*.sql; do
  printf '   %-46s' "$(basename "$file")"
  $PSQL -d "$DB_NAME" -f "$file" > /dev/null
  echo "ok"
done

echo "→ Kör seed"
$PSQL -d "$DB_NAME" -f supabase/seed.sql > /dev/null
echo "   seed.sql                                       ok"

echo "→ Kontrollerar att RLS är påslagen överallt"
UNPROTECTED=$($PSQL -d "$DB_NAME" -tAc "
  select string_agg(c.relname, ', ')
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and not c.relrowsecurity
    -- spatial_ref_sys och liknande ägs av PostGIS, inte av oss. De går inte
    -- att ändra utan superuser och innehåller ingen kunddata.
    and not exists (
      select 1 from pg_depend d
      where d.objid = c.oid and d.deptype = 'e'
    );
")
if [ -n "$UNPROTECTED" ]; then
  echo "   FEL: tabeller utan RLS: $UNPROTECTED"
  exit 1
fi
echo "   alla tabeller har RLS"

echo "→ Kontrollerar att varje tabell med RLS har minst en policy"
NO_POLICY=$($PSQL -d "$DB_NAME" -tAc "
  select string_agg(c.relname, ', ')
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and c.relrowsecurity
    and not exists (select 1 from pg_policy p where p.polrelid = c.oid)
    and not exists (
      select 1 from pg_depend d
      where d.objid = c.oid and d.deptype = 'e'
    );
")
if [ -n "$NO_POLICY" ]; then
  echo "   FEL: RLS på men ingen policy (tabellen är helt låst): $NO_POLICY"
  exit 1
fi
echo "   alla tabeller har minst en policy"

echo "→ Kontrollerar att anon och authenticated har SELECT"
# RLS räcker inte ensamt. Utan GRANT avvisas frågan med "permission denied"
# innan policyn ens utvärderas — ett schema som ser komplett ut men är dött.
# Den här kontrollen finns för att just det felet slank igenom en gång.
MISSING_GRANTS=$($PSQL -d "$DB_NAME" -tAc "
  select string_agg(format('%s(%s)', c.relname, r.rolname), ', ')
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join (values ('anon'), ('authenticated')) as r(rolname)
  where n.nspname = 'public'
    and c.relkind = 'r'
    and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')
    and not has_table_privilege(r.rolname, c.oid, 'SELECT');
")
if [ -n "$MISSING_GRANTS" ]; then
  echo "   FEL: saknar SELECT-rättighet: $MISSING_GRANTS"
  exit 1
fi
echo "   alla tabeller är läsbara för anon och authenticated"

echo "→ Testar affärslogiken"
$PSQL -d "$DB_NAME" -f scripts/verify-schema-tests.sql

echo ""
echo "Schemat verifierat mot PostgreSQL $($PSQL -d "$DB_NAME" -tAc 'show server_version')."
