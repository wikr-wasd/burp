-- 0050 — Gästen får prenumerera på notiser om sina EGNA order.
--
-- Sista luckan i Williams punkt 8 (docs/TODO.md, "Avhämtning med tid och
-- notis"). De två andra är byggda: utkorgen i 0049 vet vem som ska ha vad, och
-- 0048 gav köket ett fält för hur lång tid maten tar. Kvar var att push är
-- personalens: policyn i 0036 kräver `is_staff_of(restaurant_id)`, och en gäst
-- är inte personal någonstans.
--
-- ── Vad som ändras ────────────────────────────────────────────────────────
--
-- `restaurant_id` blir nullbar, och NULL får en betydelse:
--
--   NOT NULL  personalens enhet — larmar om ORDNINGEN i den restaurangen
--   NULL      gästens egen enhet — larmar om HENNES order, var hon än beställt
--
-- Det är två olika saker som råkar ha samma form. Alternativet vore en egen
-- tabell `guest_push_subscriptions` med samma fem kolumner, samma unika index
-- på endpoint och samma städning — och då hade en webbläsare kunnat ligga i
-- BÅDA, med två rader för samma endpoint och två notiser för samma order.
-- Det unika indexet över endpoint är just det som gör en tabell rätt här.
--
-- ── Vad som INTE ändras ───────────────────────────────────────────────────
--
-- Den anonyma gästen vid bordet får ingenting. Hon har inget konto, alltså
-- ingen `auth.uid()`, alltså ingen rad — och det är avsiktligt: QR-flödet ska
-- förbli kontolöst, vilket är hela poängen med det. Notiser hör till
-- avhämtning, där gästen ändå har ett konto för att kunna hämta sin mat.
--
-- Utkorgen i 0049 köar redan bara `PICKUP` med `guest_id`. Den här
-- migrationen vidgar alltså inte VEM som får en notis, bara HUR den når fram.

alter table public.push_subscriptions
  alter column restaurant_id drop not null;

comment on column public.push_subscriptions.restaurant_id is
  'Restaurangen enheten larmar för, eller NULL för en gästs egen enhet. NULL betyder "mina order", inte "alla restauranger".';

/*
 * Policyn skrivs om, inte kompletteras.
 *
 * `for all` med `using` och `with check` är EN policy och inte fyra. Att lägga
 * en andra bredvid hade betytt att de or:as ihop — och en gästpolicy som säger
 * "restaurant_id is null" hade då släppt igenom personalens rader också, så
 * länge någon skickade in null. Det är enklare att läsa villkoret på ett
 * ställe än att hålla två i huvudet.
 */
drop policy if exists push_subscriptions_own on public.push_subscriptions;

create policy push_subscriptions_own on public.push_subscriptions
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (
      -- Gästens egen enhet. Ingen restaurang att höra till, och därför inget
      -- att kontrollera utöver att raden är hennes.
      restaurant_id is null
      -- Personalens enhet. Oförändrat: utan det här kan en inloggad
      -- prenumerera på en främmande restaurangs beställningar.
      or public.is_staff_of(restaurant_id)
    )
  );

comment on table public.push_subscriptions is
  'En rad per webbläsare som vill larma. Knuten till enheten och inte till personen — samma kock kan ha telefon och surfplatta, och samma gäst kan ha telefon och dator. restaurant_id skiljer personalens larm från gästens.';
