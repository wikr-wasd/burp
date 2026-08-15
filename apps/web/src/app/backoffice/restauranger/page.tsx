import type { Metadata } from "next";
import Link from "next/link";
import { DEFAULT_FEE_BPS } from "@burp/core";
import { PlatformHeader } from "@/components/platform/platform-header";
import { RestaurantList } from "@/components/platform/restaurant-list";
import { requirePlatformAdmin } from "@/lib/platform";
import { createClient } from "@/lib/supabase/server";

/**
 * Alla restauranger på plattformen — onboarding, avtal och avstängning.
 *
 * Den här listan är hela skälet till att plattformsrollen finns: RLS döljer
 * annars allt utom den egna restaurangen, och en PENDING-restaurang är inte
 * ens publikt läsbar.
 */

export const metadata: Metadata = {
  title: "Restauranger",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export interface PlatformRestaurant {
  id: string;
  name: string;
  slug: string;
  citySlug: string;
  city: string;
  orgNumber: string;
  status: string;
  feeOverrideBps: number | null;
  ratingAverage: number | null;
  ratingCount: number;
  createdAt: string;
  staffCount: number;
}

const STATUSES = ["PENDING", "ACTIVE", "PAUSED", "SUSPENDED"] as const;

interface PageProps {
  searchParams: Promise<{ status?: string }>;
}

export default async function PlatformRestaurantsPage({ searchParams }: PageProps) {
  const admin = await requirePlatformAdmin();
  const params = await searchParams;

  const statusFilter = (STATUSES as readonly string[]).includes(params.status ?? "")
    ? params.status
    : undefined;

  const supabase = await createClient();

  let query = supabase
    .from("restaurants")
    .select(
      "id, name, slug, city, city_slug, org_number, status, fee_override_bps, rating_average, rating_count, created_at",
    )
    .order("created_at", { ascending: false });

  if (statusFilter) query = query.eq("status", statusFilter);

  const { data: rows } = await query;

  // Antal anställda per restaurang. Hämtas separat i stället för som en
  // aggregerad join — PostgREST kan inte gruppera, och listan är kort nog.
  const { data: staffRows } = await supabase.from("staff").select("restaurant_id").eq("is_active", true);

  const staffCount = new Map<string, number>();
  for (const row of staffRows ?? []) {
    staffCount.set(row.restaurant_id, (staffCount.get(row.restaurant_id) ?? 0) + 1);
  }

  const restaurants: PlatformRestaurant[] = (rows ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    city: row.city,
    citySlug: row.city_slug,
    orgNumber: row.org_number,
    status: row.status,
    feeOverrideBps: row.fee_override_bps,
    ratingAverage: row.rating_average,
    ratingCount: row.rating_count,
    createdAt: row.created_at,
    staffCount: staffCount.get(row.id) ?? 0,
  }));

  return (
    <>
      <PlatformHeader admin={admin} current="restauranger" />

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-bold">Restauranger</h1>
        <p className="mt-1 text-sm opacity-70">
          Standardavgift {(DEFAULT_FEE_BPS / 100).toFixed(2).replace(".", ",")} %. En restaurang
          utan egen avgift följer med när standarden ändras.
        </p>

        <nav className="mt-4 flex flex-wrap gap-2" aria-label="Filtrera på status">
          <FilterChip href="/backoffice/restauranger" active={!statusFilter}>
            Alla
          </FilterChip>
          {STATUSES.map((status) => (
            <FilterChip
              key={status}
              href={`/backoffice/restauranger?status=${status}`}
              active={statusFilter === status}
            >
              {statusLabel(status)}
            </FilterChip>
          ))}
        </nav>

        {restaurants.length === 0 ? (
          <p className="mt-8 opacity-60">Inga restauranger med den statusen.</p>
        ) : (
          <RestaurantList restaurants={restaurants} canWrite={admin.role !== "support"} />
        )}
      </main>
    </>
  );
}

function FilterChip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`min-h-9 px-3.5 py-1.5 text-sm ${
        active ? "bg-burp-600 font-medium text-white" : "border border-[var(--rule)]"
      }`}
    >
      {children}
    </Link>
  );
}

export function statusLabel(status: string): string {
  switch (status) {
    case "PENDING":
      return "Väntar";
    case "ACTIVE":
      return "Aktiv";
    case "PAUSED":
      return "Pausad";
    case "SUSPENDED":
      return "Avstängd";
    default:
      return status;
  }
}
