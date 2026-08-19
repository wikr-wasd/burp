-- 0028 — Omdöme från bordet, utan konto.
--
-- Omdömesformuläret har hittills bara funnits på `/konto`, alltså bara för
-- inloggade gäster. Men **QR-gästen är anonym och ser det aldrig** — och det är
-- precis den gäst som just ätit, sitter kvar vid bordet och har mest att säga.
-- Restaurangens betyg byggdes därför på den minsta och minst representativa
-- delen av sina gäster.
--
-- Ett brev efteråt är sämre: den anonyma gästen har ingen adress, och den som
-- fått maten svarar på plats eller inte alls.
--
-- Åtkomsten bevisas med bordssessionen, inte med ett konto — samma modell som
-- resten av QR-flödet. Sessionen ligger i en cookie och inte i en JWT, så den
-- går inte att skriva en RLS-policy mot; servern verifierar den och skriver
-- sedan med service role, precis som `POST /api/orders` gör. Kolumnen nedan
-- finns för att raden ska bära HUR åtkomsten bevisades, inte bara att den gjorde
-- det.

alter table public.reviews
  add column table_session_id uuid references public.table_sessions(id) on delete set null;

create index reviews_table_session_idx on public.reviews (table_session_id)
  where table_session_id is not null;

comment on column public.reviews.table_session_id is
  'Bordssessionen som bevisade åtkomsten. Satt för anonyma QR-gäster; null för inloggade, som bevisar den med sitt konto.';

-- Ett omdöme utan avsändare är ingen källa. Antingen ett konto eller en
-- bordssession — aldrig ingetdera.
--
-- NOT VALID: befintliga rader kontrolleras inte. Det finns inga i produktion
-- ännu, men seed-data och testdata skrevs innan kolumnen fanns, och en
-- migration som faller på gammal data är en migration som inte går att köra.
alter table public.reviews
  add constraint reviews_has_author
  check (user_id is not null or table_session_id is not null)
  not valid;

-- Sessionen måste vara ORDERNS session.
--
-- Utan den här går det att lämna omdöme på en främmande order genom att skicka
-- sitt eget sessions-id på raden — samma hål som migration 0024 stängde för
-- kontantbetalningar. Triggern och inte en check-constraint, eftersom villkoret
-- läser en annan tabell.
create or replace function public.enforce_review_session_matches_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session uuid;
begin
  if new.table_session_id is null then
    return new;
  end if;

  select table_session_id into v_session from public.orders where id = new.order_id;

  if v_session is distinct from new.table_session_id then
    raise exception 'Omdömet hör inte till samma bordssession som ordern'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

create trigger reviews_session_matches_order
  before insert on public.reviews
  for each row execute function public.enforce_review_session_matches_order();
