-- 0045 — Vem gjorde vad med pengarna.
--
-- Uppgifterna har funnits hela tiden: `refunds.created_by` säger vem som
-- lämnade tillbaka pengar och varför, och `order_events.actor_id` vem som
-- avbröt en order. Ingen yta visade dem.
--
-- Det är skillnaden mellan att kunna svara på "vem betalade tillbaka 240 mark i
-- fredags" och att behöva be någon köra en fråga i databasen. En logg ingen kan
-- läsa är en logg som inte finns när den behövs — och det är alltid när någon
-- redan är misstänksam.
--
-- ── Varför en funktion och inte en vy ───────────────────────────────────────
--
-- Raderna ska bära VEM, alltså ett namn eller en e-postadress. Den uppgiften
-- ligger i `profiles`, som bara går att läsa om sig själv — en ägare kommer
-- inte åt sin egen personals profil, och ska inte göra det heller för andra
-- ändamål än det här.
--
-- Alternativet vore service role i applikationen. Det hade fungerat men flyttat
-- behörighetskontrollen till app-lagret, vilket regel 5 säger emot. Funktionen
-- är SECURITY DEFINER och kontrollerar rollen SJÄLV, med samma `has_role_at`
-- som RLS använder. Namnet läcker inte längre än till den som redan får se
-- restaurangens ekonomi.

create or replace function public.restaurant_money_events(
  p_restaurant_id uuid,
  p_from          timestamptz,
  p_to            timestamptz
)
returns table (
  kind        text,
  at          timestamptz,
  order_id    uuid,
  amount_ore  integer,
  currency    public.currency_code,
  reason      text,
  actor_kind  text,
  actor_name  text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  /*
   * Ägare och chef. Servitören får inte se listan.
   *
   * Hon står med i den — det är hon som kvitterar notorna — och en logg över
   * vem som rört pengarna ska läsas av den som har ansvar för dem, inte av
   * alla som förekommer i den.
   *
   * Kontrollen sker här och inte i appen. Funktionen kringgår RLS, så en
   * glömd kontroll i en route handler hade räckt för att öppna den.
   */
  if not public.has_role_at(
       p_restaurant_id, array['owner', 'manager']::public.staff_role[]
     ) and not public.is_platform_admin() then
    raise exception 'Bara ägare och chef ser vem som rört pengarna'
      using errcode = 'insufficient_privilege';
  end if;

  return query
  -- Återbetalningar. Beloppet, skälet och vem som tryckte.
  select
    'REFUND'::text,
    coalesce(r.settled_at, r.created_at),
    r.order_id,
    r.amount_ore,
    p.currency,
    r.reason,
    case when r.created_by is null then 'SYSTEM' else 'STAFF' end::text,
    -- Null när leverantören själv drev återbetalningen, till exempel vid en
    -- chargeback. Då finns det ingen människa att peka ut, och raden ska säga
    -- det i stället för att se tom ut.
    coalesce(pr.full_name, pr.email, u.email)
  from public.refunds r
  join public.payments p on p.id = r.payment_id
  left join auth.users u on u.id = r.created_by
  left join public.profiles pr on pr.id = r.created_by
  where r.restaurant_id = p_restaurant_id
    and r.status <> 'FAILED'
    and coalesce(r.settled_at, r.created_at) >= p_from
    and coalesce(r.settled_at, r.created_at) < p_to

  union all

  -- Avbrutna order. `order_events` är append-only och kan inte skrivas om.
  select
    'CANCELLED'::text,
    e.created_at,
    e.order_id,
    o.total_ore,
    o.currency,
    null::text,
    e.actor_kind,
    coalesce(pr.full_name, pr.email, u.email)
  from public.order_events e
  join public.orders o on o.id = e.order_id
  left join auth.users u on u.id = e.actor_id
  left join public.profiles pr on pr.id = e.actor_id
  where e.restaurant_id = p_restaurant_id
    and e.to_status = 'CANCELLED'
    and e.created_at >= p_from
    and e.created_at < p_to

  order by 2 desc;
end;
$$;

revoke execute on function public.restaurant_money_events(uuid, timestamptz, timestamptz)
  from public, anon;
grant execute on function public.restaurant_money_events(uuid, timestamptz, timestamptz)
  to authenticated, service_role;

comment on function public.restaurant_money_events is
  'Återbetalningar och avbrutna order med vem som låg bakom. SECURITY DEFINER därför att namnet ligger i profiles, som bara går att läsa om sig själv — rollkontrollen sker i funktionen.';
