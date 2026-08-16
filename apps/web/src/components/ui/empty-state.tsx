import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Tomt tillstånd — en lista som inte har något att visa.
 *
 * Fanns tidigare som en ensam grå mening under en rubrik, olika formulerad och
 * olika placerad på varje sida. Det läser som att sidan inte laddat klart. En
 * ikon och en ram gör skillnaden tydlig: här SKA det vara tomt, och det är
 * inget fel.
 *
 * Ikonen bär betydelse och väljs efter listan — ett bord för bordslistan, en
 * stjärna för omdömena. En generisk låda hade lika gärna kunnat utelämnas.
 *
 * `action` är till för de tomma tillstånd som har ett självklart nästa steg.
 * Har listan det inte ska fältet lämnas tomt; en knapp som bara stänger något
 * gör ett tomt tillstånd sämre, inte bättre.
 */
export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: LucideIcon;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="card px-6 py-12 text-center">
      <Icon size={28} aria-hidden="true" className="mx-auto text-[var(--muted)]" />
      <p className="mt-3 font-medium">{title}</p>
      {body ? (
        <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-[var(--muted)]">{body}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
