#!/bin/bash
# Spärr mot kommandon som inte går att ångra.
#
# Lånad i form från 123Connect och skärpt på det Burp faktiskt riskerar.
# Exit 2 blockerar anropet och visar meddelandet; exit 0 släpper igenom.
#
# Spärren ersätter inte omdöme. Den finns för att reglerna i CLAUDE.md — "aldrig
# direkt på main", "hemligheter hör inte i git" — ska ha något bakom sig än att
# den som skriver minns dem.

INPUT=$(cat)

# Kommandot ur verktygets indata. Node finns alltid i det här repot; python
# gör det inte, vilket 123Connects version förutsätter.
COMMAND=$(printf '%s' "$INPUT" | node -e "
let d='';
process.stdin.on('data', c => d += c).on('end', () => {
  try { process.stdout.write(JSON.parse(d).tool_input?.command ?? ''); } catch {}
});
" 2>/dev/null || echo "")

[ -z "$COMMAND" ] && exit 0

block() {
  echo "SÄKERHETSSPÄRR: $1"
  exit 2
}

# ── Produktionsgrenen ──────────────────────────────────────────────────────
#
# `main` är produktion, och deploy-flödet kräver Williams uttryckliga
# godkännande. En force-push dit kan dessutom radera historik som inte finns
# någon annanstans.
if grep -qE "git push.*(-f|--force).*(main|master)" <<<"$COMMAND"; then
  block "force-push till main är blockerad. Fråga William först."
fi

if grep -qE "git (commit|push).*(--no-verify|-n\b)" <<<"$COMMAND"; then
  block "--no-verify hoppar över hookarna. Rätta orsaken i stället."
fi

# ── Hemligheter ────────────────────────────────────────────────────────────
#
# `.env.local` bär service role-nyckeln, QR_TOKEN_SECRET och CRON_SECRET. En
# commit av den är inte ett misstag som går att ta tillbaka — nyckeln ligger i
# historiken och måste roteras.
if grep -qE "git (add|commit).*\.env(\.local)?([^.a-z]|$)" <<<"$COMMAND"; then
  block ".env får inte committas. Den bär service role-nyckeln och QR_TOKEN_SECRET."
fi

# ── QR-hemligheten ─────────────────────────────────────────────────────────
#
# Regel 10: ett byte ogiltigförklarar samtliga utskrivna dekaler hos alla
# restauranger. Det finns ingen väg tillbaka utom att trycka nya.
if grep -qE "QR_TOKEN_SECRET\s*=" <<<"$COMMAND"; then
  block "QR_TOKEN_SECRET byts aldrig. Varje utskriven QR-dekal slutar fungera."
fi

# ── Destruktiv SQL ─────────────────────────────────────────────────────────
#
# `supabase db reset` är undantaget: det är det normala sättet att köra om
# migrationerna lokalt, och det står i CLAUDE.md.
if grep -qiE "drop (table|database|schema)|truncate .*cascade" <<<"$COMMAND"; then
  grep -qE "supabase db reset" <<<"$COMMAND" || \
    block "DROP eller TRUNCATE CASCADE. Bekräfta med William först."
fi

# ── Loggarna ───────────────────────────────────────────────────────────────
#
# Regel 6: order_events och loyalty_transactions är oföränderliga. Triggers
# blockerar UPDATE och DELETE — men inte om någon släpper triggern först.
if grep -qiE "drop trigger.*(order_events|loyalty_transactions)" <<<"$COMMAND"; then
  block "Loggarna är oföränderliga (regel 6). Triggern får inte tas bort."
fi

# ── Filsystemet ────────────────────────────────────────────────────────────
if grep -qE "rm\s+(-[a-zA-Z]*[rf][a-zA-Z]*\s+)+(/|~|/home|/usr|/etc|/var|/c/Users/[^/]+/?$)" <<<"$COMMAND"; then
  block "Rekursiv radering på en systemväg."
fi

exit 0
