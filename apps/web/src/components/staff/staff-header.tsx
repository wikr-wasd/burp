import Link from "next/link";
import {
  BookOpen,
  Banknote,
  ChefHat,
  LayoutGrid,
  LogOut,
  MessageSquare,
  QrCode,
  Settings,
  TrendingUp,
} from "lucide-react";
import { STAFF_ROLE_LABELS } from "@burp/core";
import type { StaffContext } from "@/lib/auth";

/**
 * Gemensam topprad för personalytorna.
 *
 * Bär Burps vinjett bredvid restaurangens namn. Personalytorna är tätare än
 * gästytorna — det är ett arbetsredskap, inte en bilaga — men de ska ändå se
 * ut att komma från samma produkt. Utan vinjetten gör de inte det.
 */
/**
 * Vilken sektion som är den aktiva.
 *
 * Alla undersidor skickade tidigare "dashboard", så "Order" stod markerad i
 * rött oavsett var man befann sig. Markeringen sa alltså ingenting — och en
 * markering som alltid pekar på samma ställe är sämre än ingen, eftersom den
 * ser ut att svara på frågan "var är jag".
 */
export type StaffSection =
  | "dashboard"
  | "kok"
  | "kassa"
  | "meny"
  | "bord"
  | "omdomen"
  | "statistik"
  | "installningar";

export function StaffHeader({
  staff,
  current,
}: {
  staff: StaffContext;
  current: StaffSection;
}) {
  return (
    <header className="border-b border-[var(--rule)]">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-4">
        <Link
          href="/"
          aria-label="Burp — till startsidan"
          className="font-display text-2xl leading-none transition-colors duration-[var(--speed)] hover:text-burp-600"
        >
          Burp
        </Link>

        <div className="mr-auto border-l border-[var(--rule)] pl-6">
          <p className="font-medium">{staff.restaurantName}</p>
          <p className="label-caps mt-0.5">
            {staff.email} · {STAFF_ROLE_LABELS[staff.role]}
          </p>
        </div>

        <nav className="flex items-center gap-4 text-sm">
          {/* Kocken har bara köksskärmen — dashboarden döljs för att inte
              erbjuda en väg som RLS ändå stänger. */}
          {staff.role !== "kitchen" ? (
            <Link
              href="/dashboard"
              className={navClass(current === "dashboard")}
            >
              <LayoutGrid size={16} aria-hidden="true" />
              Order
            </Link>
          ) : null}

          <Link
            href="/kok"
            className={navClass(current === "kok")}
          >
            <ChefHat size={16} aria-hidden="true" />
            Köksskärm
          </Link>

          {/* Kassan är servitörens vy lika mycket som chefens. Att kräva ägaren
              för varje nota hade betytt att ingen kvitterar något en fredag
              kväll — och en okvitterad nota är en nota ingen stämt av. */}
          {staff.role !== "kitchen" ? (
            <Link href="/dashboard/kassa" className={navClass(current === "kassa")}>
              <Banknote size={16} aria-hidden="true" />
              Kassa
            </Link>
          ) : null}

          {staff.role === "owner" || staff.role === "manager" ? (
            <>
              <Link href="/dashboard/meny" className={navClass(current === "meny")}>
                <BookOpen size={16} aria-hidden="true" />
                Meny
              </Link>
              <Link href="/dashboard/bord" className={navClass(current === "bord")}>
                <QrCode size={16} aria-hidden="true" />
                Bord
              </Link>
              <Link href="/dashboard/omdomen" className={navClass(current === "omdomen")}>
                <MessageSquare size={16} aria-hidden="true" />
                Omdömen
              </Link>
              <Link href="/dashboard/statistik" className={navClass(current === "statistik")}>
                <TrendingUp size={16} aria-hidden="true" />
                Statistik
              </Link>
              <Link href="/dashboard/installningar" className={navClass(current === "installningar")}>
                <Settings size={16} aria-hidden="true" />
                Inställningar
              </Link>
            </>
          ) : null}

          <form action="/logga-ut" method="post">
            <button type="submit" className={navClass(false)}>
              <LogOut size={16} aria-hidden="true" />
              Logga ut
            </button>
          </form>
        </nav>
      </div>
    </header>
  );
}

/**
 * En enda plats där personalytans navigering får sitt utseende.
 *
 * Aktiv sida markeras med rött och en linje under, precis som filtren på
 * gästytorna. Samma markering på båda ställena betyder att personalen och
 * gästen lär sig ett mönster, inte två.
 */
function navClass(active: boolean): string {
  return [
    "inline-flex min-h-11 items-center gap-1.5 border-b-2 transition-colors duration-[var(--speed)]",
    active
      ? "border-burp-600 font-medium text-burp-600"
      : "border-transparent text-[var(--muted)] hover:text-[var(--foreground)]",
  ].join(" ");
}
