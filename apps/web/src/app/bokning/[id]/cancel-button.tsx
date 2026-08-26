"use client";

import { useState, useTransition } from "react";
import { CalendarX } from "lucide-react";
import { cancelBooking } from "./actions";

/**
 * Avbokningsknappen.
 *
 * Bekräftelse först: att avboka är destruktivt och går inte att ångra — en ny
 * bokning på samma tid kan vara tagen av någon annan innan gästen hinner om.
 */
export function CancelButton({
  id,
  token,
  labels,
}: {
  id: string;
  token: string;
  labels: { cancel: string; confirm: string; done: string; failed: string };
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function submit() {
    if (!window.confirm(labels.confirm)) return;

    startTransition(async () => {
      const result = await cancelBooking(id, token);
      setMessage(result.ok ? labels.done : labels.failed);
    });
  }

  if (message) {
    return (
      <p role="status" className="mt-6 text-sm">
        {message}
      </p>
    );
  }

  return (
    <button type="button" onClick={submit} disabled={pending} className="btn btn-secondary mt-6">
      <CalendarX size={16} aria-hidden="true" />
      {labels.cancel}
    </button>
  );
}
