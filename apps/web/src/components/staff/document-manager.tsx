"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Trash2 } from "lucide-react";
import type { Dictionary } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/client";
import {
  deleteDocument,
  registerDocument,
} from "@/app/dashboard/installningar/document-actions";

/**
 * Restaurangens dokument (migration 0064).
 *
 * Filen går direkt från webbläsaren till Storage med personalens egen session,
 * precis som bilderna. Skälet är detsamma: en tio megabyte stor fil genom en
 * serverless-funktion kostar minne och tid i onödan, och storage-policyn avgör
 * redan vem som får skriva var.
 *
 * Titeln skrivs FÖRE filen väljs. Annars börjar uppladdningen mot en tom titel
 * och posten avvisas efter att filen redan ligger uppe — en fil utan post är
 * skräp ingen städar.
 */

const MAX_BYTES = 10 * 1024 * 1024;

export interface StaffDocument {
  id: string;
  title: string;
  status: string;
  sizeBytes: number;
  rejectionReason: string | null;
}

export function DocumentManager({
  restaurantId,
  documents,
  labels,
}: {
  restaurantId: string;
  documents: StaffDocument[];
  labels: Dictionary["staff"]["documents"];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function handleFile(file: File) {
    setMessage(null);

    if (title.trim().length === 0) {
      setMessage({ ok: false, text: labels.needTitle });
      return;
    }
    if (file.type !== "application/pdf") {
      setMessage({ ok: false, text: labels.formatError });
      return;
    }
    if (file.size > MAX_BYTES) {
      setMessage({ ok: false, text: labels.sizeError });
      return;
    }

    setBusy(true);

    const path = `${restaurantId}/${crypto.randomUUID()}.pdf`;
    const supabase = createClient();

    const { error: uploadError } = await supabase.storage
      .from("restaurant-docs")
      .upload(path, file, { contentType: "application/pdf" });

    if (uploadError) {
      setMessage({ ok: false, text: labels.failed });
      setBusy(false);
      return;
    }

    startTransition(async () => {
      const result = await registerDocument({
        title,
        storagePath: path,
        sizeBytes: file.size,
      });

      if (result.ok) {
        setTitle("");
        setMessage({ ok: true, text: labels.pending });
        router.refresh();
      } else {
        // Posten misslyckades men filen ligger uppe. Städa, annars blir den
        // liggande utan att någon vet om den.
        await supabase.storage.from("restaurant-docs").remove([path]);
        setMessage({ ok: false, text: result.message ?? labels.failed });
      }

      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    });
  }

  function remove(id: string) {
    if (!window.confirm(labels.removeConfirm)) return;

    startTransition(async () => {
      const result = await deleteDocument(id);
      if (result.ok) router.refresh();
      else setMessage({ ok: false, text: result.message ?? labels.failed });
    });
  }

  const working = busy || pending;

  const statusLabel: Record<string, string> = {
    PENDING: labels.pending,
    APPROVED: labels.approved,
    REJECTED: labels.rejected,
  };

  return (
    <div>
      {documents.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">{labels.empty}</p>
      ) : (
        <ul className="space-y-2">
          {documents.map((document) => (
            <li
              key={document.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-[var(--rule)] px-3 py-2"
            >
              <span className="flex min-w-0 items-center gap-2">
                <FileText aria-hidden className="size-4 shrink-0 opacity-60" />
                <span className="min-w-0">
                  <span className="block truncate">{document.title}</span>
                  <span className="block text-xs text-[var(--muted)]">
                    {statusLabel[document.status] ?? document.status} ·{" "}
                    {Math.max(1, Math.round(document.sizeBytes / 1024))} kB
                    {document.rejectionReason ? ` · ${document.rejectionReason}` : ""}
                  </span>
                </span>
              </span>

              <button
                type="button"
                onClick={() => remove(document.id)}
                disabled={working}
                aria-label={`${labels.remove}: ${document.title}`}
                className="btn btn-secondary shrink-0"
              >
                <Trash2 aria-hidden className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 max-w-sm space-y-3">
        <label className="block">
          <span className="label-caps">{labels.titleLabel}</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={labels.titlePlaceholder}
            maxLength={120}
            disabled={working}
            className="field mt-1.5"
          />
        </label>

        <label className="block">
          <span className="sr-only">{labels.choose}</span>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            disabled={working}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleFile(file);
            }}
            className="block w-full text-sm file:mr-3 file:min-h-11 file:cursor-pointer file:rounded-md file:border file:border-[var(--rule)] file:bg-transparent file:px-4 file:text-sm file:text-inherit disabled:opacity-50 dark:file:border-white/20"
          />
        </label>

        {working ? <p className="text-sm opacity-70">{labels.adding}</p> : null}

        {message ? (
          <p
            role="alert"
            className={`text-sm ${message.ok ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}
          >
            {message.text}
          </p>
        ) : null}
      </div>
    </div>
  );
}
