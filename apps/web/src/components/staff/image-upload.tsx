"use client";

import type { Dictionary } from "@/lib/i18n";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { registerMedia } from "@/app/dashboard/meny/media-actions";
import { ImageAdjuster } from "@/components/staff/image-adjuster";
import { createClient } from "@/lib/supabase/client";

/**
 * Bilduppladdning för en rätt eller för restaurangens huvudbild (avsnitt 8.1).
 *
 * Filen går direkt från webbläsaren till Supabase Storage med personalens egen
 * session — inte via vår server. Skälet är storleken: en tio megabyte stor
 * telefonbild genom en serverless-funktion kostar minne och tid i onödan, och
 * Storage har redan RLS-policyerna som avgör vem som får skriva var.
 *
 * Först när filen ligger på plats registreras medieposten. Ordningen spelar
 * roll: en post utan fil vore en rad i granskningskön som visar en trasig bild.
 */

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/avif"];

export function ImageUpload({
  restaurantId,
  menuItemId,
  purpose,
  label = "Ladda upp bild",
  labels,
  currentUrl,
  mediaId,
  adjust,
}: {
  restaurantId: string;
  menuItemId?: string;
  /**
   * Vad restaurangbilden är: huvudbild, logotyp eller banner (migration 0053).
   * Saknar betydelse för en bild som hör till en rätt.
   */
  purpose?: "HERO" | "LOGO" | "BANNER";
  label?: string;
  /** Bilduppladdningens besked ur ordboken. Rena strängar — klientkod. */
  labels: Dictionary["staff"]["image"];
  currentUrl?: string | null;
  /**
   * Medieraden bakom `currentUrl`, när den finns. Utan den visas bilden men
   * går inte att justera — vilket är fallet direkt efter en uppladdning, innan
   * sidan hämtats om.
   */
  mediaId?: string | null;
  /** Justeringen rakt ur kolumnen (migration 0063). */
  adjust?: unknown;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function handleFile(file: File) {
    setMessage(null);

    if (!ACCEPTED.includes(file.type)) {
      setMessage({ ok: false, text: labels.formatError });
      return;
    }
    if (file.size > MAX_BYTES) {
      setMessage({
        ok: false,
        text: `Bilden är ${(file.size / 1024 / 1024).toFixed(1)} MB. Högsta storlek är 10 MB.`,
      });
      return;
    }

    setUploading(true);

    // Sökvägen börjar med restaurangens id. Storage-policyn jämför den mot
    // `staff`, så en restaurang kan varken skriva i eller skriva över en annans.
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const path = `${restaurantId}/${crypto.randomUUID()}.${extension}`;

    const supabase = createClient();
    const { error: uploadError } = await supabase.storage
      .from("menu-media")
      .upload(path, file, { cacheControl: "3600", upsert: false });

    setUploading(false);

    if (uploadError) {
      setMessage({ ok: false, text: `Uppladdningen misslyckades: ${uploadError.message}` });
      return;
    }

    startTransition(async () => {
      const result = await registerMedia({
        restaurantId,
        menuItemId: menuItemId ?? null,
        storagePath: path,
        altText: file.name.replace(/\.[^.]+$/, ""),
        purpose,
      });

      if (result.ok) {
        setMessage({
          ok: true,
          text: labels.uploadedNotice,
        });
        router.refresh();
      } else {
        setMessage({ ok: false, text: result.message ?? "Bilden kunde inte registreras." });
      }

      if (inputRef.current) inputRef.current.value = "";
    });
  }

  const busy = uploading || pending;

  return (
    <div>
      {/*
        Logotypen justeras inte. Den är en designad tillgång, inte ett
        telefonfoto — att dra i ljusstyrkan på ett märke är meningslöst, och
        migration 0063 har därför ingen kolumn för den.
      */}
      {currentUrl && mediaId && purpose !== "LOGO" ? (
        <ImageAdjuster
          mediaId={mediaId}
          imageUrl={currentUrl}
          initial={adjust}
          ratio={purpose === "BANNER" ? "aspect-[21/9]" : "aspect-video"}
          labels={labels}
        />
      ) : currentUrl ? (
        <img
          src={currentUrl}
          alt=""
          className="mb-2 aspect-video w-full max-w-xs object-cover"
        />
      ) : null}

      <label className="inline-block">
        <span className="sr-only">{label}</span>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED.join(",")}
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleFile(file);
          }}
          className="block w-full text-sm file:mr-3 file:min-h-11 file:cursor-pointer file:rounded-md file:border file:border-[var(--rule)] file:bg-transparent file:px-4 file:text-sm file:text-inherit disabled:opacity-50 dark:file:border-white/20"
        />
      </label>

      {busy ? (
        <p className="mt-2 text-sm opacity-70">
          {uploading ? "Laddar upp…" : "Registrerar…"}
        </p>
      ) : null}

      {message ? (
        <p
          role="alert"
          className={`mt-2 text-sm ${
            message.ok ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"
          }`}
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
