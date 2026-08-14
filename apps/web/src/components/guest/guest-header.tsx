import Link from "next/link";
import type { Guest } from "@/lib/guest";

/** Topprad för gästens konto. */
export function GuestHeader({
  guest,
  current,
}: {
  guest: Guest;
  current: "bestallningar" | "favoriter" | "adresser";
}) {
  return (
    <header className="border-b border-black/10 dark:border-white/15">
      <div className="mx-auto flex max-w-2xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-4 sm:px-6">
        <div className="mr-auto">
          <Link href="/" className="text-xl font-bold tracking-tight">
            Burp
          </Link>
          <p className="text-sm opacity-60">{guest.fullName ?? guest.email}</p>
        </div>

        <nav className="flex items-center gap-4 text-sm">
          <NavLink href="/konto" active={current === "bestallningar"}>
            Beställningar
          </NavLink>
          <NavLink href="/konto/favoriter" active={current === "favoriter"}>
            Favoriter
          </NavLink>
          <NavLink href="/konto/adresser" active={current === "adresser"}>
            Adresser
          </NavLink>

          <form action="/logga-ut" method="post">
            <button type="submit" className="opacity-60 hover:opacity-100">
              Logga ut
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
