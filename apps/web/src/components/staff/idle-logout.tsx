"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Loggar ut en glömd surfplatta.
 *
 * Kassan står på en disk och används av flera personer. Utan det här är den
 * inloggad tills någon aktivt loggar ut — alltså över natten, och över helgen.
 * Den som går fram till den ser gårdagens omsättning, kan kvittera notor och,
 * om det råkar vara ägarens konto, betala tillbaka pengar.
 *
 * ── Vad den INTE rör ────────────────────────────────────────────────────────
 *
 * Köksskärmen. `/kok` bygger sin egen ram och renderar aldrig `StaffShell`, så
 * den här komponenten når den inte. Det är avsiktligt och viktigt: köksskärmen
 * är en tavla som ska stå på hela passet utan att någon rör den, och en
 * utloggning mitt i en lunchrush är värre än allt den skyddar mot.
 *
 * ── Tiden ───────────────────────────────────────────────────────────────────
 *
 * Trettio minuter utan att någon rör skärmen. Kortare blir en plåga under
 * service — och en personal som loggas ut var femte minut skriver lösenordet på
 * en lapp vid kassan, vilket är sämre än ingen utloggning alls. Längre gör
 * spärren meningslös; poängen är att enheten inte står öppen över natten.
 *
 * Varningen kommer en minut innan, så att ingen tappar det hon höll på med.
 */

const IDLE_MS = 30 * 60 * 1000;
const WARNING_MS = 60 * 1000;

export function IdleLogout() {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdown = useRef<ReturnType<typeof setInterval> | null>(null);
  const form = useRef<HTMLFormElement>(null);

  const clearTimers = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    if (countdown.current) clearInterval(countdown.current);
    idleTimer.current = null;
    countdown.current = null;
  }, []);

  const logOut = useCallback(() => {
    clearTimers();
    // Riktig formulärpost och inte fetch: utloggningen svarar med en
    // omdirigering till inloggningen, och webbläsaren ska följa den. En fetch
    // hade lämnat personalen kvar på en sida som inte längre har en session.
    form.current?.requestSubmit();
  }, [clearTimers]);

  const startWarning = useCallback(() => {
    setSecondsLeft(Math.round(WARNING_MS / 1000));

    countdown.current = setInterval(() => {
      setSecondsLeft((left) => {
        if (left === null) return null;
        if (left <= 1) {
          logOut();
          return 0;
        }
        return left - 1;
      });
    }, 1000);
  }, [logOut]);

  const reset = useCallback(() => {
    clearTimers();
    setSecondsLeft(null);
    idleTimer.current = setTimeout(startWarning, IDLE_MS - WARNING_MS);
  }, [clearTimers, startWarning]);

  useEffect(() => {
    reset();

    /*
     * Bara riktiga tecken på en människa.
     *
     * `mousemove` räknas inte: en surfplatta som står och driver kan skicka
     * rörelser utan att någon är där, och en pekare som råkar ligga still över
     * skärmen hade hållit sessionen vid liv i evighet.
     *
     * `visibilitychange` räknas när fliken blir synlig igen — någon plockade
     * upp plattan, och det är i praktiken samma sak som ett tryck.
     */
    const onActivity = () => reset();
    const onVisible = () => {
      if (document.visibilityState === "visible") reset();
    };

    window.addEventListener("pointerdown", onActivity);
    window.addEventListener("keydown", onActivity);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearTimers();
      window.removeEventListener("pointerdown", onActivity);
      window.removeEventListener("keydown", onActivity);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [reset, clearTimers]);

  return (
    <>
      <form ref={form} action="/logga-ut" method="post" className="hidden" />

      {secondsLeft !== null ? (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="idle-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="card w-full max-w-sm p-6 text-center">
            <h2 id="idle-title" className="font-display text-2xl">
              Loggas ut om {secondsLeft} s
            </h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Skärmen har stått orörd en stund. Kassan loggas ut så att ingen annan kommer åt
              den.
            </p>

            <div className="mt-6 flex flex-col gap-2">
              {/* Knappen behöver ingen egen hanterare — ett tryck var som helst
                  räknas redan som aktivitet och nollställer klockan. Den finns
                  för att säga att det GÅR att stanna kvar. */}
              <button type="button" onClick={reset} className="btn btn-primary">
                Jag är kvar
              </button>
              <button type="button" onClick={logOut} className="btn btn-secondary">
                Logga ut nu
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
