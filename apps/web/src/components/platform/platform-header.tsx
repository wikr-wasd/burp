import Link from "next/link";
import { PLATFORM_ROLE_LABELS, type PlatformContext } from "@/lib/platform";

/**
 * Topprad för Burps backoffice.
 *
 * Medvetet annorlunda i färg och ordval än restaurangernas dashboard. Den som
 * har båda rollerna ska aldrig behöva undra vilken yta hen står i — särskilt
 * inte innan en åtgärd som stänger av någons restaurang.
 */
export function PlatformHeader({
  admin,
  current,
}: {
  admin: PlatformContext;
  current: "oversikt" | "restauranger" | "media";
}) {
  return (
    <header className="border-b border-black/10 bg-burp-900/10 dark:border-white/15 dark:bg-burp-900/30">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-4 sm:px-6">
        <div className="mr-auto">
          <p className="font-semibold">
            Burp backoffice
            <span className="ml-2 rounded-full bg-burp-600 px-2 py-0.5 text-xs font-medium text-white">
              intern
            </span>
          </p>
          <p className="text-sm opacity-60">
            {admin.email} · {PLATFORM_ROLE_LABELS[admin.role]}
          </p>
        </div>

        <nav className="flex items-center gap-4 text-sm">
          <NavLink href="/backoffice" active={current === "oversikt"}>
            Översikt
          </NavLink>
          <NavLink href="/backoffice/restauranger" active={current === "restauranger"}>
            Restauranger
          </NavLink>
          <NavLink href="/backoffice/media" active={current === "media"}>
            Media
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
