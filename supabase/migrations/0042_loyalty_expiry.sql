-- 0042 — Poängen går faktiskt ut.
--
-- `expires_at` sattes på varje EARN-rad av 0016, och `EXPIRE` har funnits i
-- `loyalty_kind` sedan 0001. Ingen kod har någonsin skrivit en sådan rad.
--
-- Kundpanelen visade ändå rätt siffra, för `calculateBalance()` i @burp/core
-- räknar bort poster vars `expires_at` passerat. Regeln fanns alltså BARA i
-- TypeScript — och därmed hade varje annan läsare av loggen ett annat svar.
--
-- Det märktes när GDPR-exporten byggdes dagen innan: den summerade
-- `loyalty_transactions.points` rakt av och rapporterade 700 poäng för en gäst
-- vars konto visade 200. Samma sorts fel som dricksen och avräkningen, och av
-- samma orsak — regeln låg inte där siffran räknas.
--
-- Regel 7 säger att saldot aldrig lagras utan räknas ur loggen. Den regeln är
-- värdelös om loggen inte innehåller det som hänt: en poäng som gått ut ska
-- synas som en rad, inte bara försvinna i en filtrering i klienten.

/*
 * Saldot, definierat på ETT ställe.
 *
 * Speglar `calculateBalance()` i packages/core/src/loyalty.ts — **ändras den
 * ena måste den andra följa med**, precis som `country_time_zone()` och
 * `COUNTRY_INFO`. Ett test i verify-schema-tests.sql kör samma fall som
 * loyalty.test.ts, så att de inte tyst glider isär.
 *
 * Utgångna poster räknas bort ÄVEN om jobbet inte hunnit boka dem. Annars visar
 * saldot poäng gästen inte kan använda under den tid som går mellan
 * utgångsdatum och nästa körning.
 */
create or replace function public.loyalty_balance(
  p_account_id uuid,
  p_at         timestamptz default now()
)
returns integer
language sql
stable
as $$
  select greatest(
    0,
    -- Hela loggen, EXPIRE-raderna inräknade.
    coalesce(sum(lt.points), 0)
    -- Minus det som mognat men ÄNNU INTE bokförts. Att i stället hoppa över
    -- varje mognad post låter EXPIRE-raden dra av samma poäng en gång till, och
    -- gästen tappar resten av sitt saldo natten jobbet först kör.
    - greatest(
        0,
        coalesce(sum(lt.points) filter (
          where lt.points > 0 and lt.expires_at is not null and lt.expires_at <= p_at
        ), 0)
        - coalesce(-sum(lt.points) filter (where lt.kind = 'EXPIRE'), 0)
      )
  )::integer
  from public.loyalty_transactions lt
  where lt.account_id = p_account_id;
$$;

comment on function public.loyalty_balance is
  'Saldot för ett lojalitetskonto. Speglar calculateBalance() i @burp/core — ändras den ena måste den andra följa med.';

revoke execute on function public.loyalty_balance(uuid, timestamptz) from public, anon;
grant execute on function public.loyalty_balance(uuid, timestamptz) to authenticated, service_role;

/*
 * Jobbet som bokför utgången.
 *
 * En rad per konto och körning, inte en per utgången intjäning. Loggen ska säga
 * "så här mycket gick ut den här dagen", vilket är det bokföringen och gästen
 * behöver veta; vilken enskild måltid poängen kom från är redan bokfört på
 * EARN-raden.
 *
 * ── Hur mycket som bokförs, och varför det inte är enkelt ───────────────────
 *
 * Beloppet är `least(mognat − redan bokfört, saldot före körningen)`.
 *
 * Taket mot saldot är det som gör funktionen säker. Utan det kan en inlösen som
 * redan förbrukat poängen bokföras bort en gång till, och saldot bli negativt —
 * en poängskuld åt fel håll.
 *
 * Det är ändå inte fullständigt riktigt den dag inlösen finns. Rätt svar kräver
 * att varje inlösen vet VILKEN intjäning den förbrukade, alltså partier med
 * först-in-först-ut. Det beslutet hör ihop med vem som bekostar en inlöst
 * belöning — docs/OPEN-QUESTIONS.md fråga 3 — och ska inte gissas här.
 *
 * I dag skriver ingen kod REDEEM-rader, så de två räkningarna ger samma svar.
 * Testet i verify-schema-tests.sql visar båda fallen, så att skillnaden är
 * synlig den dag den blir verklig i stället för att upptäckas i ett saldo.
 */
create or replace function public.expire_loyalty_points(p_at timestamptz default now())
returns TABLE (accounts_touched integer, points_expired bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_accounts integer := 0;
  v_points   bigint  := 0;
  v_row      record;
begin
  for v_row in
    select
      lt.account_id,
      -- Mognat: positiva poster vars datum passerat.
      coalesce(sum(lt.points) filter (
        where lt.points > 0 and lt.expires_at is not null and lt.expires_at <= p_at
      ), 0)::bigint as matured,
      -- Redan bokfört som utgånget, som ett positivt tal.
      coalesce(-sum(lt.points) filter (where lt.kind = 'EXPIRE'), 0)::bigint as booked,
      -- Rå summa över loggen, alltså saldot innan den här körningen.
      coalesce(sum(lt.points), 0)::bigint as raw_balance
    from public.loyalty_transactions lt
    group by lt.account_id
  loop
    declare
      v_amount bigint := least(v_row.matured - v_row.booked, v_row.raw_balance);
    begin
      if v_amount <= 0 then
        continue;
      end if;

      insert into public.loyalty_transactions (account_id, kind, points, description)
      values (v_row.account_id, 'EXPIRE', -v_amount,
              'Poäng som gick ut ' || to_char(p_at, 'YYYY-MM-DD'));

      v_accounts := v_accounts + 1;
      v_points   := v_points + v_amount;
    end;
  end loop;

  return query select v_accounts, v_points;
end;
$$;

revoke execute on function public.expire_loyalty_points(timestamptz) from public, anon, authenticated;
grant execute on function public.expire_loyalty_points(timestamptz) to service_role;

comment on function public.expire_loyalty_points is
  'Bokför utgångna poäng som EXPIRE-rader. Körs av /api/jobs/expire-loyalty. Bokför aldrig mer än saldot — se kommentaren i migration 0042 om varför det inte räcker den dag inlösen finns.';

-- ── Exporten läser samma saldo som gästen ser ───────────────────────────────
--
-- `export_guest_data` (0041) summerade `points` rakt av och rapporterade
-- därför poäng gästen inte kan använda. En kopia enligt artikel 15 som visar
-- ett annat saldo än kontosidan är inte en kopia av något.

create or replace function public.export_guest_data(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'exported_at', now(),
    'format', 'burp-guest-export-1',

    'account', (
      select jsonb_build_object(
        'id', u.id,
        'email', u.email,
        'name', p.full_name,
        'phone', p.phone,
        'birth_date', p.birth_date,
        'marketing_opt_in', p.marketing_opt_in,
        'created_at', p.created_at
      )
      from auth.users u
      left join public.profiles p on p.id = u.id
      where u.id = p_user_id
    ),

    'addresses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'label', a.label,
        'street_address', a.street_address,
        'postal_code', a.postal_code,
        'city', a.city,
        'door_code', a.door_code,
        'instructions', a.instructions,
        'created_at', a.created_at
      ) order by a.created_at)
      from public.addresses a where a.user_id = p_user_id
    ), '[]'::jsonb),

    'orders', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', o.id,
        'restaurant', r.name,
        'placed_at', o.placed_at,
        'completed_at', o.completed_at,
        'status', o.status,
        'type', o.type,
        'currency', o.currency,
        'items_gross_ore', o.items_gross_ore,
        'items_vat_ore', o.items_vat_ore,
        'discount_ore', o.discount_ore,
        'tip_ore', o.tip_ore,
        'total_ore', o.total_ore,
        'note', o.note,
        'items', coalesce((
          select jsonb_agg(jsonb_build_object(
            'name', oi.name_snapshot,
            'quantity', oi.quantity,
            'unit_price_ore', oi.unit_price_ore,
            'line_gross_ore', oi.line_gross_ore,
            'note', oi.note
          ) order by oi.created_at)
          from public.order_items oi where oi.order_id = o.id
        ), '[]'::jsonb)
      ) order by o.created_at)
      from public.orders o
      join public.restaurants r on r.id = o.restaurant_id
      where o.guest_id = p_user_id
    ), '[]'::jsonb),

    'reviews', coalesce((
      select jsonb_agg(jsonb_build_object(
        'restaurant', r.name,
        'created_at', rv.created_at,
        'rating_food', rv.rating_food,
        'rating_service', rv.rating_service,
        'rating_delivery', rv.rating_delivery,
        'comment', rv.comment,
        'published', rv.is_published,
        'restaurant_response', rv.response
      ) order by rv.created_at)
      from public.reviews rv
      join public.restaurants r on r.id = rv.restaurant_id
      where rv.user_id = p_user_id
    ), '[]'::jsonb),

    'favourites', coalesce((
      select jsonb_agg(jsonb_build_object('restaurant', r.name, 'since', f.created_at)
                       order by f.created_at)
      from public.favorites f
      join public.restaurants r on r.id = f.restaurant_id
      where f.user_id = p_user_id
    ), '[]'::jsonb),

    'loyalty', coalesce((
      select jsonb_agg(jsonb_build_object(
        'restaurant', r.name,
        -- Samma funktion som kontosidan läser. En export som säger ett annat
        -- saldo än gästen ser är sämre än ingen export.
        'balance_points', public.loyalty_balance(la.id),
        'transactions', coalesce((
          select jsonb_agg(jsonb_build_object(
            'at', lt.created_at,
            'kind', lt.kind,
            'points', lt.points,
            'expires_at', lt.expires_at,
            'description', lt.description
          ) order by lt.created_at)
          from public.loyalty_transactions lt where lt.account_id = la.id
        ), '[]'::jsonb)
      ))
      from public.loyalty_accounts la
      left join public.restaurants r on r.id = la.restaurant_id
      where la.user_id = p_user_id
    ), '[]'::jsonb),

    'coupons_used', coalesce((
      select jsonb_agg(jsonb_build_object(
        'code', c.code,
        'restaurant', r.name,
        'at', cr.redeemed_at,
        'discount_ore', cr.discount_ore,
        'returned_at', cr.released_at
      ) order by cr.redeemed_at)
      from public.coupon_redemptions cr
      join public.coupons c on c.id = cr.coupon_id
      join public.restaurants r on r.id = c.restaurant_id
      where cr.guest_id = p_user_id
    ), '[]'::jsonb),

    'punch_card_rewards', coalesce((
      select jsonb_agg(jsonb_build_object(
        'restaurant', r.name,
        'at', pcr.redeemed_at,
        'card_size', pcr.size,
        'reward_ore', pcr.reward_ore,
        'returned_at', pcr.released_at
      ) order by pcr.redeemed_at)
      from public.punch_card_redemptions pcr
      join public.restaurants r on r.id = pcr.restaurant_id
      where pcr.guest_id = p_user_id
    ), '[]'::jsonb)
  );
$$;

-- Inget nytt index. `loyalty_transactions_expiring_idx` (0007) täcker redan
-- exakt frågan jobbet ställer — positiva poster med ett utgångsdatum — och
-- lades dit för det påminnelsemail som ännu inte finns.
