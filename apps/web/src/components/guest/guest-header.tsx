import Link from "next/link";
import { BurpMark } from "@/components/ui/burp-mark";
import type { Dictionary } from "@/lib/i18n";
import type { Guest } from "@/lib/guest";

/**
 * Topprad för gästens konto.
 *
 * Bär samma vinjett som resten av sajten. En gäst som klickar sig från
 * restaurangsidan till sina beställningar ska inte känna att hen bytt produkt
 * på vägen.
 *
 * Texterna kommer in utifrån. Sidorna har redan slagit upp ordboken ur
 * `Accept-Language`, och en komponent som hämtade den själv hade kunnat svara
 * på ett annat språk än sidan den sitter i.
 */
export function GuestHeader({
  guest,
  current,
  texts,
  homeLabel,
}: {
  guest: Guest;
  current: "bestallningar" | "favoriter" | "adresser" | "uppgifter";
  texts: Dictionary["account"];
  /** `site.home` — samma etikett som vinjetten bär överallt annars. */
  homeLabel: string;
}) {
  return (
    <header className="border-b border-[var(--rule)]">
      <div className="mx-auto flex max-w-2xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-4 sm:px-6">
        <div className="mr-auto">
          <Link
            href="/"
            aria-label={homeLabel}
            className="transition-opacity duration-[var(--speed)] hover:opacity-80"
          >
            <BurpMark size="sm" />
          </Link>
          <p className="label-caps mt-1">{guest.fullName ?? guest.email}</p>
        </div>

        <nav className="flex items-center gap-4 text-sm">
          <NavLink href="/konto" active={current === "bestallningar"}>
            {texts.orders}
          </NavLink>
          <NavLink href="/konto/favoriter" active={current === "favoriter"}>
            {texts.favorites}
          </NavLink>
          <NavLink href="/konto/adresser" active={current === "adresser"}>
            {texts.addresses}
          </NavLink>
          <NavLink href="/konto/uppgifter" active={current === "uppgifter"}>
            {texts.details}
          </NavLink>

          <form action="/logga-ut" method="post">
            <button
              type="submit"
              className="min-h-11 text-[var(--muted)] transition-colors duration-[var(--speed)] hover:text-burp-600"
            >
              {texts.logOut}
            </button>
          </form>
        </nav>
      </div>
    </header>
  );
}

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={active ? "font-medium" : "opacity-60 hover:opacity-100"}>
      {children}
    </Link>
  );
}
