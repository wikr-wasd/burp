/**
 * Adressen till kodfältet, och ingenting annat.
 *
 * Egen fil därför att `lib/mfa.ts` är `server-only` och drar in
 * `supabase/server`, som läser cookies genom `next/headers`. Proxy:n har sin
 * egen klient och sitt eget cookie-hanterande och får inte importera den — men
 * den måste kunna omdirigera till samma adress som server components gör.
 *
 * En sträng på två ställen hade varit den sortens dubblett som glider isär:
 * sidan flyttas, proxy:n omdirigerar till den gamla adressen, och resultatet
 * är en studs mellan två sidor som var för sig ser riktiga ut.
 */
export const MFA_CHALLENGE_PATH = "/logga-in/verifiera";
