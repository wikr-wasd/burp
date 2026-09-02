"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";
import { moderateDocument } from "@/app/backoffice/actions";

/**
 * Granskningskö för restaurangernas dokument (migration 0064).
 *
 * Ingen inbäddad läsare. En PDF öppnas i en egen flik med webbläsarens egen
 * visare — att bygga en läsare i granskningsvyn hade varit ett lager mellan
 * granskaren och det hen ska bedöma, och det är precis fel håll.
 */

export interface ModeratedDocument {
  id: string;
  title: string;
  status: string;
  url: string;
  sizeBytes: number;
  createdAt: string;
  restaurantName: string;
  rejectionReason: string | null;
}

export function DocumentQueue({
  documents,
  canWrite,
}: {
  documents: ModeratedDocument[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<{ ok: boolean; message?: string }>) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        setRejecting(null);
        setReason("");
        setError(null);
        router.refresh();
      } else {
        setError(result.message ?? "Åtgärden misslyckades.");
      }
    });
  }

  return (
    <>
      {error ? (
        <p role="alert" className="mt-4 text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      ) : null}

      <ul className="mt-4 space-y-3">
        {documents.map((document) => (
          <li key={document.id} className="card p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p className="font-medium">{document.restaurantName}</p>
              <p className="text-sm opacity-60">
                {new Date(document.createdAt).toLocaleDateString("sv-SE")}
              </p>
            </div>

            <a
              href={document.url}
              target="_blank"
              rel="noopener noreferrer"
              className="link mt-2 inline-flex items-center gap-2 text-sm"
            >
              <FileText aria-hidden className="size-4" />
              {document.title}
              <span className="opacity-60">
                · {Math.max(1, Math.round(document.sizeBytes / 1024))} kB
              </span>
            </a>

            {document.rejectionReason ? (
              <p className="mt-2 text-sm opacity-70">Skäl: {document.rejectionReason}</p>
            ) : null}

            {canWrite && document.status === "PENDING" ? (
              rejecting === document.id ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <input
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="Skäl till avvisning"
                    maxLength={200}
                    className="field flex-1"
                  />
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => moderateDocument(document.id, false, reason))}
                    className="btn btn-secondary"
                  >
                    Avvisa
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => setRejecting(null)}
                    className="btn btn-secondary"
                  >
                    Avbryt
                  </button>
                </div>
              ) : (
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => moderateDocument(document.id, true))}
                    className="btn btn-primary"
                  >
                    Godkänn
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => setRejecting(document.id)}
                    className="btn btn-secondary"
                  >
                    Avvisa
                  </button>
                </div>
              )
            ) : null}
          </li>
        ))}
      </ul>
    </>
  );
}
