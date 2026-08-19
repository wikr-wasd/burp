-- 0034 — En räknare som fungerar över flera instanser.
--
-- `lib/rate-limit.ts` räknade i processminnet. På Vercel betyder det att varje
-- serverlös instans har sin egen räknare: en angripare vars anrop fördelas över
-- tio instanser får tio gånger så många försök, och räknaren nollställs vid
-- varje kallstart. Gränsen fanns alltså på papperet.
--
-- Den ursprungliga planen var Upstash Redis. Postgres gör samma sak här, och
-- det avgörande är att den redan finns: ingen ny leverantör, ingen ny
-- hemlighet, och — det viktigaste — **det går att testa nu**. En Upstash-adapter
-- hade varit otestad kod tills någon skaffade ett konto.
--
-- Kostnaden är en tur till databasen per skyddat anrop. De endpoints som
-- skyddas — QR-uppslag, orderläggning, kupong- och presentkortskoder, inloggning
-- — talar ändå med databasen flera gånger, så det är en extra fråga och inte en
-- ny sorts anrop.
--
-- Fast fönster och inte glidande. En gäst kan i värsta fall göra dubbla antalet
-- anrop runt en fönstergräns; det är en känd egenskap och helt oviktig här,
-- eftersom gränserna är satta för att stoppa skript och inte för att mäta.

create table public.rate_limit_hits (
  -- "order:203.0.113.7". Nyckeln byggs av anropande kod och innehåller alltid
  -- vilken yta det gäller, så att två ytor inte delar räknare.
  key           text not null,
  -- Fönstrets början, avrundad till fönsterlängden. Två anrop i samma fönster
  -- hamnar därmed på samma rad.
  window_start  timestamptz not null,
  hits          integer not null default 0,

  primary key (key, window_start)
);

-- Städning sker opportunistiskt i funktionen nedan, och indexet är det som gör
-- den billig.
create index rate_limit_hits_window_idx on public.rate_limit_hits (window_start);

alter table public.rate_limit_hits enable row level security;

-- Ingen policy för anon eller authenticated, med flit. Tabellen skrivs bara av
-- funktionen nedan, som körs med service role. En klient som kunde läsa den
-- skulle se hur nära gränsen den ligger; en som kunde skriva skulle kunna
-- nollställa den.
create policy rate_limit_hits_select_platform on public.rate_limit_hits
  for select to authenticated
  using (public.is_platform_admin());

comment on table public.rate_limit_hits is
  'Delad räknare för rate limiting. Ersätter räknaren i processminnet, som inte fungerade över flera Vercel-instanser.';

-- ── Räkna ett anrop ─────────────────────────────────────────────────────────
--
-- Hela poängen är att räkningen sker ATOMÄRT. En läsning följd av en skrivning
-- från applikationen hade tappat anrop som kommer samtidigt — vilket är precis
-- de anrop en gräns finns till för.

create or replace function public.rate_limit_hit(
  p_key            text,
  p_limit          integer,
  p_window_seconds integer,
  p_at             timestamptz default now()
)
returns table (
  allowed   boolean,
  remaining integer,
  reset_at  timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_start timestamptz;
  v_hits         integer;
begin
  if p_limit <= 0 or p_window_seconds <= 0 then
    raise exception 'Ogiltig gräns: % anrop per % sekunder', p_limit, p_window_seconds
      using errcode = 'check_violation';
  end if;

  v_window_start := to_timestamp(
    floor(extract(epoch from p_at) / p_window_seconds) * p_window_seconds
  );

  insert into public.rate_limit_hits (key, window_start, hits)
  values (p_key, v_window_start, 1)
  on conflict (key, window_start)
  do update set hits = public.rate_limit_hits.hits + 1
  returning hits into v_hits;

  /*
   * Städning utan bakgrundsjobb.
   *
   * Gamla fönster är döda så fort de passerat, men något måste ta bort dem. Ett
   * schemalagt jobb vore ett till ställe som kan sluta köra utan att någon
   * märker det; i stället städar var hundrade anrop. Slumpen räcker: gränserna
   * mäts i tiotal anrop per minut, så tabellen hinner aldrig växa mellan
   * städningarna.
   */
  if v_hits % 100 = 0 then
    delete from public.rate_limit_hits
    where window_start < p_at - interval '1 hour';
  end if;

  return query
  select
    v_hits <= p_limit,
    greatest(0, p_limit - v_hits),
    v_window_start + make_interval(secs => p_window_seconds);
end;
$$;

revoke execute on function public.rate_limit_hit(text, integer, integer, timestamptz)
  from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer, timestamptz) to service_role;

comment on function public.rate_limit_hit is
  'Räknar ett anrop och svarar om det får gå igenom. Atomärt: en läsning följd av en skrivning hade tappat just de samtidiga anrop en gräns finns till för.';
