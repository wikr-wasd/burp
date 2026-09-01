import { AlertTriangle, CircleCheck, CircleSlash } from "lucide-react";
import type { Capability, ReadinessSummary } from "@/lib/readiness";

/**
 * Systemstatus — vad som faktiskt är påslaget.
 *
 * Anledningen till att den finns står i `lib/readiness.ts`: en funktion kan
 * vara fullt byggd och helt död på en rad i miljön, och ingenting i produkten
 * säger det. Tvåstegsverifieringen låg så i tio dagar.
 *
 * Ren serverkomponent. Det finns ingenting att klicka på — listan är ett
 * besked, inte en kontroll. Att göra "slå på" till en knapp här hade betytt
 * att backoffice skriver i miljövariabler, vilket den inte kan och inte ska.
 *
 * ── Varför den inte ligger på /api/health ───────────────────────────────────
 *
 * Hälsokontrollen är publik. En lista över vilka nycklar som saknas är
 * spaningshjälp åt vem som helst — "webhook-hemligheten saknas" berättar att
 * betalningar inte bokförs. Statusen hör därför hemma bakom inloggningen, och
 * `/api/health` behåller sitt magra publika svar.
 */

const STYLE: Record<Capability["level"], { Icon: typeof CircleCheck; tone: string; label: string }> =
  {
    live: { Icon: CircleCheck, tone: "text-green-700 dark:text-green-400", label: "påslaget" },
    degraded: { Icon: AlertTriangle, tone: "text-amber-700 dark:text-amber-400", label: "halvt" },
    off: { Icon: CircleSlash, tone: "text-[var(--muted)]", label: "avstängt" },
  };

export function SystemStatus({
  capabilities,
  summary,
}: {
  capabilities: readonly Capability[];
  summary: ReadinessSummary;
}) {
  return (
    <div className="mt-4 space-y-2">
      {/*
        Sammanfattningen först, och den räknar det som BLOCKERAR — inte det som
        är avstängt. Kortbetalning kan vara avstängd med avsikt; en halv
        Stripe-konfiguration kan den inte.
      */}
      <p className="text-sm">
        {summary.blocking === 0 ? (
          <span className="text-green-700 dark:text-green-400">
            Ingenting saknas som hindrar en skarp lansering.
          </span>
        ) : (
          <span className="text-amber-700 dark:text-amber-400">
            {summary.blocking === 1
              ? "En sak saknas som hindrar en skarp lansering."
              : `${summary.blocking} saker saknas som hindrar en skarp lansering.`}
          </span>
        )}{" "}
        <span className="opacity-60">
            {summary.live} påslagna · {summary.degraded} halva · {summary.off} avstängda
        </span>
      </p>

      <ul className="space-y-2">
        {capabilities.map((entry) => {
          const { Icon, tone, label } = STYLE[entry.level];

          return (
            <li key={entry.key} className="card p-3">
              <div className="flex items-start gap-3">
                <Icon size={18} aria-hidden="true" className={`mt-0.5 shrink-0 ${tone}`} />

                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {entry.name}{" "}
                    <span className={`text-sm font-normal ${tone}`}>({label})</span>
                    {entry.level !== "live" && entry.blocksLaunch ? (
                      <span className="badge ml-2 bg-amber-600/15 text-amber-700 dark:text-amber-400">
                        hindrar lansering
                      </span>
                    ) : null}
                  </p>

                  <p className="mt-1 text-sm opacity-70">{entry.detail}</p>

                  {/* Åtgärden står bara när det finns något att göra. En rad
                      som säger "allt är bra, gör så här" läser som ett fel. */}
                  {entry.fix && entry.level !== "live" ? (
                    <p className="mt-1 text-sm">
                      <span className="label-caps">Åtgärd</span>{" "}
                      <span className="opacity-70">{entry.fix}</span>
                    </p>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {/*
        Det listan INTE kan svara på, utskrivet.

        En statusyta som tiger om sina blinda fläckar är farligare än ingen alls
        — den läses som fullständig. Supabase rapporterar inte om TOTP är
        påslaget, och det finns ingen väg att fråga utan en användarsession.
      */}
      <p className="pt-1 text-sm opacity-60">
        Tvåstegsverifieringen står inte i listan: Supabase rapporterar inte om TOTP
        är påslaget, och det går inte att läsa av härifrån. Den prövas i stället av
        <code className="mx-1 font-mono">smoke.sh</code>, som registrerar en riktig
        faktor och verifierar en kod vid varje körning.
      </p>
    </div>
  );
}
