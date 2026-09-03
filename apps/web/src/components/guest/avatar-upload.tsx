"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserRound } from "lucide-react";
import type { Dictionary } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/client";
import { removeAvatar, saveAvatar } from "@/app/konto/uppgifter/actions";

/**
 * Gästens profilbild.
 *
 * Filen går direkt från webbläsaren till Storage med gästens egen session,
 * som restaurangernas bilder. Skillnaden är bucketen: `guest-avatars` är
 * PRIVAT (migration 0067), och adressen signeras vid visning. Ett ansikte har
 * högre krav än en tallrik.
 *
 * Ingen granskningskö. Bilden visas bara för gästen själv, så det finns
 * ingenting för Burp att stå som värd för — och en granskare som tittar på
 * främlingars ansikten utan att någon annan ser dem vore integritetsintrånget
 * i sig.
 */

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/avif"];

export function AvatarUpload({
  currentUrl,
  userId,
  labels,
}: {
  currentUrl: string | null;
  userId: string;
  labels: Dictionary["account"];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [busy, setBusy] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);

    if (!ACCEPTED.includes(file.type)) {
      setError(labels.photoFormatError);
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(labels.photoSizeError);
      return;
    }

    setBusy(true);

    const extension = file.type.split("/")[1] ?? "jpg";
    const path = `${userId}/${crypto.randomUUID()}.${extension}`;
    const supabase = createClient();

    const { error: uploadError } = await supabase.storage
      .from("guest-avatars")
      .upload(path, file, { contentType: file.type });

    if (uploadError) {
      setError(labels.photoFailed);
      setBusy(false);
      return;
    }

    startTransition(async () => {
      const result = await saveAvatar(path);

      if (result.ok) {
        router.refresh();
      } else {
        // Posten misslyckades men filen ligger uppe. Städa, annars blir den
        // liggande i en privat bucket som ingen kan hitta den i.
        await supabase.storage.from("guest-avatars").remove([path]);
        setError(result.message ?? labels.photoFailed);
      }

      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    });
  }

  function clear() {
    startTransition(async () => {
      const result = await removeAvatar();
      if (result.ok) router.refresh();
      else setError(result.message ?? labels.photoFailed);
    });
  }

  const working = busy || pending;

  return (
    <div className="mt-4 flex flex-wrap items-center gap-5">
      {/* Rund ram och ingen fyrkant: en profilbild är ett ansikte, och formen
          säger det innan bilden hunnit laddas. */}
      <span className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-full border border-[var(--rule)] bg-[var(--surface)]">
        {currentUrl ? (
          <img src={currentUrl} alt="" className="size-full object-cover" />
        ) : (
          <UserRound aria-hidden="true" className="size-8 text-[var(--muted)]" />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <label className="block">
          <span className="sr-only">{labels.photoChoose}</span>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED.join(",")}
            disabled={working}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleFile(file);
            }}
            className="block w-full text-sm file:mr-3 file:min-h-11 file:cursor-pointer file:rounded-md file:border file:border-[var(--rule)] file:bg-transparent file:px-4 file:text-sm file:text-inherit disabled:opacity-50 dark:file:border-white/20"
          />
        </label>

        {currentUrl ? (
          <button
            type="button"
            onClick={clear}
            disabled={working}
            className="link mt-2 text-sm disabled:opacity-50"
          >
            {labels.photoRemove}
          </button>
        ) : null}

        {working ? (
          <p className="mt-2 text-sm opacity-70">{labels.photoUploading}</p>
        ) : null}

        {error ? (
          <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-400">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
