import Link from "next/link";
import {
  BookOpen,
  Banknote,
  CalendarDays,
  ChefHat,
  LayoutGrid,
  LogOut,
  MessageSquare,
  QrCode,
  Receipt,
  ReceiptText,
  ScrollText,
  Settings,
  ShieldCheck,
  Ticket,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";
import { type StaffRole } from "@burp/core";
import { LanguagePicker } from "@/components/staff/language-picker";
import { BurpMark } from "@/components/ui/burp-mark";
import type { StaffContext } from "@/lib/auth";
import { dictionary } from "@/lib/i18n";

/**
 * Personalytans navigering.
 *
 * En sidomeny på stora skärmar, en rullande rad på små. Innan den fanns låg
 * allt i en topprad som växte varje gång en yta lades till — och en topprad
 * som radbryts är inte en meny, den är en lista.
 *
 * Punkterna definieras EN gång, i `STAFF_NAV`, och renderas två gånger. Två
 * listor hade glidit isär första gången någon lade till en yta i den ena.
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
  | "oversikt"
  | "order"
  | "kok"
  | "kassa"
  | "meny"
  | "bord"
  | "bokningar"
  | "erbjudanden"
  | "omdomen"
  | "statistik"
  | "avrakning"
  | "handelser"
  | "personal"
  | "installningar"
  | "sakerhet";

/**
 * En navigeringspunkt.
 *
 * `section` är BÅDE markeringens nyckel och etikettens. Punkten bar tidigare
 * sin svenska text här; nu slås den upp i `t.staff.section[section]`, och
 * eftersom nycklarna redan hette precis det behövdes ingen andra tabell som
 * översätter mellan dem. Två tabeller hade betytt att en ny yta går att lägga
 * till på ett ställe och glömma på det andra.
 */
interface NavItem {
  section: StaffSection;
  href: string;
  icon: LucideIcon;
  /** Roller som ser punkten. Kocken har bara köksskärmen. */
  roles: readonly StaffRole[];
}

const ALL_BUT_KITCHEN = ["owner", "manager", "staff"] as const;
const MANAGEMENT = ["owner", "manager"] as const;

export const STAFF_NAV: readonly NavItem[] = [
  { section: "oversikt", href: "/dashboard", icon: LayoutGrid, roles: ALL_BUT_KITCHEN },
  { section: "order", href: "/dashboard/order", icon: Receipt, roles: ALL_BUT_KITCHEN },
  { section: "kok", href: "/kok", icon: ChefHat, roles: ["owner", "manager", "staff", "kitchen"] },
  { section: "kassa", href: "/dashboard/kassa", icon: Banknote, roles: ALL_BUT_KITCHEN },
  { section: "meny", href: "/dashboard/meny", icon: BookOpen, roles: MANAGEMENT },
  { section: "bord", href: "/dashboard/bord", icon: QrCode, roles: MANAGEMENT },
  /*
   * Bokningarna når även servitören.
   *
   * Det är hen som står i lokalen när sällskapet kommer, och "kom"-knappen är
   * det som hindrar att bordet släpps mitt under deras måltid. En vy bara för
   * ägaren hade betytt att knappen trycks långt efter att den behövdes.
   */
  { section: "bokningar", href: "/dashboard/bokningar", icon: CalendarDays, roles: ALL_BUT_KITCHEN },
  { section: "erbjudanden", href: "/dashboard/erbjudanden", icon: Ticket, roles: MANAGEMENT },
  { section: "omdomen", href: "/dashboard/omdomen", icon: MessageSquare, roles: MANAGEMENT },
  { section: "statistik", href: "/dashboard/statistik", icon: TrendingUp, roles: MANAGEMENT },
  { section: "avrakning", href: "/dashboard/avrakning", icon: ReceiptText, roles: MANAGEMENT },
  { section: "handelser", href: "/dashboard/handelser", icon: ScrollText, roles: MANAGEMENT },
  { section: "personal", href: "/dashboard/personal", icon: Users, roles: MANAGEMENT },
];

const SETTINGS: NavItem = {
  section: "installningar",
  href: "/dashboard/installningar",
  icon: Settings,
  roles: MANAGEMENT,
};

/**
 * Den egna inloggningen.
 *
 * Står utanför både `STAFF_NAV` och `SETTINGS` av exakt samma skäl som
 * språkväljaren: Inställningar är restaurangens och kräver ägare eller chef,
 * men andra faktorn är personens egen — och kocken, som aldrig ser den sidan,
 * har den inloggning som står påslagen längst av alla.
 */
const SECURITY: NavItem = {
  section: "sakerhet",
  href: "/dashboard/sakerhet",
  icon: ShieldCheck,
  roles: ["owner", "manager", "staff", "kitchen"],
};

function visible(items: readonly NavItem[], role: StaffRole): NavItem[] {
  return items.filter((item) => item.roles.includes(role));
}

/** Sidomenyn. Döljs under `lg`, där raden nedan tar över. */
export function StaffSidebar({
  staff,
  current,
}: {
  staff: StaffContext;
  current: StaffSection;
}) {
  const t = dictionary(staff.locale).staff;
  const items = visible(STAFF_NAV, staff.role);
  const settings = visible([SETTINGS], staff.role);

  return (
    <aside className="hidden w-58 shrink-0 flex-col gap-0.5 border-r border-[var(--rule)] bg-[var(--surface)] p-3 lg:flex">
      <Link
        href="/"
        aria-label={t.home}
        className="px-2 pb-4 transition-opacity duration-[var(--speed)] hover:opacity-80"
      >
        <BurpMark size="sm" />
      </Link>

      {/* Restaurangens namn står överst, inte Burps. Personalen vet vilken
          produkt de sitter i; det de behöver veta är vilken restaurang de
          redigerar — särskilt den som jobbar på två. */}
      <div className="mb-2 border-b border-[var(--rule)] px-2 pb-3">
        <p className="truncate font-medium">{staff.restaurantName}</p>
        <p className="label-caps mt-0.5 truncate normal-case">
          {staff.email} · {t.role[staff.role]}
        </p>
      </div>

      {items.map((item) => (
        <NavLink key={item.section} item={item} label={t.section[item.section]} active={item.section === current} />
      ))}

      <div className="flex-1" />

      {settings.map((item) => (
        <NavLink key={item.section} item={item} label={t.section[item.section]} active={item.section === current} />
      ))}

      <NavLink
        item={SECURITY}
        label={t.section.sakerhet}
        active={current === "sakerhet"}
      />

      {/* Språket står näst sist och inte under Inställningar. Inställningar
          är restaurangens och kräver ägare eller chef; det här är personens
          eget, och kocken — som inte ser den sidan alls — måste nå det. */}
      <LanguagePicker
        current={staff.locale}
        label={t.language}
        savingLabel={t.languageSaving}
        errorLabel={t.languageError}
      />

      <form action="/logga-ut" method="post">
        <button type="submit" className={`${linkClass(false)} w-full`}>
          <LogOut size={16} aria-hidden="true" />
          {t.logOut}
        </button>
      </form>
    </aside>
  );
}

/** Raden för telefon och surfplatta i porträtt. Rullar i sidled. */
export function StaffTopBar({
  staff,
  current,
}: {
  staff: StaffContext;
  current: StaffSection;
}) {
  const t = dictionary(staff.locale).staff;
  const items = [
    ...visible(STAFF_NAV, staff.role),
    ...visible([SETTINGS], staff.role),
    SECURITY,
  ];

  return (
    <div className="border-b border-[var(--rule)] bg-[var(--surface)] lg:hidden">
      <div className="flex items-center justify-between gap-4 px-4 py-3">
        <Link href="/" aria-label={t.home}>
          <BurpMark size="sm" wordmark={false} />
        </Link>
        <p className="min-w-0 flex-1 truncate font-medium">{staff.restaurantName}</p>
        <form action="/logga-ut" method="post">
          <button type="submit" className="label-caps min-h-11 hover:text-burp-600">
            {t.logOut}
          </button>
        </form>
      </div>

      <nav
        aria-label={t.navLabel}
        className="flex gap-1 overflow-x-auto px-2 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((item) => (
          <NavLink key={item.section} item={item} label={t.section[item.section]} active={item.section === current} />
        ))}
      </nav>

      {/* Även här, av samma skäl som i sidomenyn: den som bara har en telefon
          måste kunna byta språk utan att först hitta en dator. */}
      <div className="border-t border-[var(--rule)] px-2 py-1">
        <LanguagePicker
          current={staff.locale}
          label={t.language}
          savingLabel={t.languageSaving}
          errorLabel={t.languageError}
        />
      </div>
    </div>
  );
}

function NavLink({
  item,
  label,
  active,
}: {
  item: NavItem;
  label: string;
  active: boolean;
}) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={linkClass(active)}
    >
      <Icon size={16} aria-hidden="true" />
      {label}
    </Link>
  );
}

/**
 * En enda plats där personalytans navigering får sitt utseende.
 *
 * Aktiv punkt är röd text på en svag röd platta — samma markering som
 * mockupen. Höjden är 44 px också här: personalen tabbar och trycker sig
 * igenom dashboarden med feta fingrar och en surfplatta.
 */
function linkClass(active: boolean): string {
  return [
    "inline-flex min-h-11 shrink-0 items-center gap-2.5 rounded-[0.5rem] px-2.5 text-sm whitespace-nowrap transition-colors duration-[var(--speed)]",
    active
      ? "bg-burp-50 font-medium text-burp-600 dark:bg-burp-900/30"
      : "text-[var(--muted)] hover:bg-[var(--background)] hover:text-[var(--foreground)]",
  ].join(" ");
}
