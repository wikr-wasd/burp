"use client";

import { useEffect, useState, useTransition } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";
import {
  removePushSubscription,
  savePushSubscription,
} from "@/app/dashboard/installningar/push-actions";

/**
 * Slår på notiser för den här enheten.
 *
 * Knappen är per ENHET och inte per person, och texten säger det. Samma kock
 * kan ha en telefon och en surfplatta; båda ska larma, och båda måste säga ja
 * var för sig. Det är hur webbpush fungerar, och att låtsas något annat hade
 * gjort att personalen undrar varför telefonen är tyst.
 *
 * Frågan ställs först när någon trycker. En webbläsare som får frågan
 * oombedd vid sidladdning får ett nej av de flesta — och ett nej går inte att
 * ångra utan att gräva i webbläsarens inställningar.
 */

type State = "OKAND" | "AV" | "PA" | "NEKAD" | "STODS_INTE";

export function PushToggle({ vapidPublicKey }: { vapidPublicKey: string | null }) {
  const [state, setState] = useState<State>("OKAND");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;

    async function check() {
      if (
        typeof window === "undefined" ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window)
      ) {
        if (!cancelled) setState("STODS_INTE");
        return;
      }

      if (Notification.permission === "denied") {
        if (!cancelled) setState("NEKAD");
        return;
      }

      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();

      if (!cancelled) setState(subscription ? "PA" : "AV");
    }

    void check();
    return () => {
      cancelled = true;
    };
  }, []);

  async function enable() {
    if (!vapidPublicKey) return;

    setError(null);

    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "NEKAD" : "AV");
        return;
      }

      const registration = await navigator.serviceWorker.register("/sw.js");
      // Väntar tills workern är aktiv. Prenumererar man mot en som fortfarande
      // installeras kastar `subscribe` i vissa webbläsare.
      await navigator.serviceWorker.ready;

      const subscription = await registration.pushManager.subscribe({
        // Krävs av alla webbläsare i dag: varje push måste vara synlig för
        // användaren. En tyst push som bara väcker kod är inte tillåten.
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });

      const json = subscription.toJSON();

      startTransition(async () => {
        const result = await savePushSubscription({
          endpoint: subscription.endpoint,
          p256dh: json.keys?.p256dh ?? "",
          auth: json.keys?.auth ?? "",
          userAgent: navigator.userAgent,
        });

        if (result.ok) {
          setState("PA");
        } else {
          // Kunde inte sparas hos oss — då ska den inte ligga kvar hos
          // webbläsaren heller, annars tror enheten att den prenumererar.
          await subscription.unsubscribe();
          setError(result.message ?? "Notiserna kunde inte slås på.");
        }
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Notiserna kunde inte slås på.");
    }
  }

  async function disable() {
    setError(null);

    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();

    if (!subscription) {
      setState("AV");
      return;
    }

    const endpoint = subscription.endpoint;
    await subscription.unsubscribe();

    startTransition(async () => {
      await removePushSubscription(endpoint);
      setState("AV");
    });
  }

  if (!vapidPublicKey) {
    return (
      <p className="mt-2 text-sm text-[var(--muted)]">
        Notiser är inte påslagna för plattformen än. Köksskärmens ljud fungerar som vanligt.
      </p>
    );
  }

  if (state === "STODS_INTE") {
    return (
      <p className="mt-2 text-sm text-[var(--muted)]">
        Den här webbläsaren kan inte ta emot notiser. På iPhone fungerar det när Burp lagts
        till på hemskärmen.
      </p>
    );
  }

  if (state === "NEKAD") {
    return (
      <p className="mt-2 text-sm text-[var(--muted)]">
        Notiser är blockerade för Burp i den här webbläsaren. Det går bara att ändra i
        webbläsarens egna inställningar — vi kan inte fråga igen.
      </p>
    );
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => void (state === "PA" ? disable() : enable())}
        disabled={pending || state === "OKAND"}
        className={state === "PA" ? "btn btn-secondary" : "btn btn-primary"}
      >
        {pending ? (
          <Loader2 size={16} aria-hidden="true" className="animate-spin" />
        ) : state === "PA" ? (
          <BellOff size={16} aria-hidden="true" />
        ) : (
          <Bell size={16} aria-hidden="true" />
        )}
        {state === "PA" ? "Stäng av på den här enheten" : "Slå på för den här enheten"}
      </button>

      <p className="mt-2 text-sm text-[var(--muted)]">
        {state === "PA"
          ? "Den här enheten larmar när en beställning kommer in."
          : "Varje enhet måste slås på för sig. Har du både telefon och surfplatta gör du det på båda."}
      </p>

      {error ? (
        <p role="alert" className="mt-2 text-sm text-burp-700 dark:text-burp-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * VAPID-nyckeln kommer som base64url och ska in som byte.
 *
 * `applicationServerKey` tar en Uint8Array. Att skicka strängen rakt in
 * fungerar i vissa webbläsare och kastar i andra, vilket är den sortens fel som
 * bara syns på en telefon någon annan äger.
 */
function urlBase64ToUint8Array(base64: string): BufferSource {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const normalized = padded.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);

  // Bufferten skapas först och fylls sedan. `new Uint8Array(n)` ger i den nya
  // TypeScript-typningen en vy vars buffert kan vara en SharedArrayBuffer, och
  // `applicationServerKey` tar bara en vanlig. Att gå via ArrayBuffer gör
  // typen entydig utan en cast som döljer vad som händer.
  const buffer = new ArrayBuffer(raw.length);
  const output = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return buffer;
}
