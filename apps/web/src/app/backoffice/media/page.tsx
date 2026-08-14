import type { Metadata } from "next";
import { PlatformHeader } from "@/components/platform/platform-header";
import { MediaQueue } from "@/components/platform/media-queue";
import { publicEnv } from "@/lib/env";
import { requirePlatformAdmin } from "@/lib/platform";
import { createClient } from "@/lib/supabase/server";

/**
 * Mediamoderering (avsnitt 8.3).
 *
 * All uppladdad media börjar som PENDING och syns inte för gästen förrän någon
 * här godkänt den. Det är avsiktligt strängt: en bild på en restaurangsida är
 * Burps ansikte lika mycket som restaurangens.
 */

export const metadata: Metadata = {
  title: "Media",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export interface ModeratedMedia {
  id: string;
  kind: string;
  status: string;
  /** Färdig URL att visa i granskningen. Byggd ur lagringsvägen, inte rå. */
  previewUrl: string | null;
  playbackUrl: string | null;
  posterUrl: string | null;
  altText: string | null;
  rejectionReason: string | null;
  createdAt: string;
  restaurantName: string;
  itemName: string | null;
}

interface PageProps {
  searchParams: Promise<{ status?: string }>;
}

export default async function MediaPage({ searchParams }: PageProps) {
  const admin = await requirePlatformAdmin();
  const params = await searchParams;

  const status = ["PENDING", "APPROVED", "REJECTED"].includes(params.status ?? "")
    ? params.status!
    : "PENDING";

  const supabase = await createClient();

  const { data: rows } = await supabase
    .from("media")
    .select(
      "id, kind, status, storage_path, playback_url, poster_url, alt_text, rejection_reason, created_at, restaurant_id, menu_item_id",
    )
    .eq("status", status)
    .order("created_at", { ascending: true });

  // Namnen hämtas separat. En join hade gått, men media kan peka på en rätt
  // som hunnit tas bort, och då ska raden ändå gå att moderera.
  const restaurantIds = [...new Set((rows ?? []).map((row) => row.restaurant_id))];
  const itemIds = [
    ...new Set((rows ?? []).map((row) => row.menu_item_id).filter((id): id is string => id !== null)),
  ];

  const [restaurantsResult, itemsResult] = await Promise.all([
    restaurantIds.length
      ? supabase.from("restaurants").select("id, name").in("id", restaurantIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    itemIds.length
      ? supabase.from("menu_items").select("id, name").in("id", itemIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  const restaurantName = new Map((restaurantsResult.data ?? []).map((r) => [r.id, r.name]));
  const itemName = new Map((itemsResult.data ?? []).map((i) => [i.id, i.name]));

  // Bucketen är publik, så URL:en går att bygga utan signering. Den byggs här
  // och inte i klienten, så att formen bara finns på ett ställe.
  const publicBase = `${publicEnv.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/menu-media/`;

  const media: ModeratedMedia[] = (rows ?? []).map((row) => ({
    id: row.id,
    kind: row.kind,
    status: row.status,
    previewUrl: row.storage_path ? `${publicBase}${row.storage_path}` : null,
    playbackUrl: row.playback_url,
    posterUrl: row.poster_url,
    altText: row.alt_text,
    rejectionReason: row.rejection_reason,
    createdAt: row.created_at,
    restaurantName: restaurantName.get(row.restaurant_id) ?? "Okänd restaurang",
    itemName: row.menu_item_id ? (itemName.get(row.menu_item_id) ?? null) : null,
  }));

  return (
    <>
      <PlatformHeader admin={admin} current="media" />

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-bold">Media</h1>
        <p className="mt-1 text-sm opacity-70">
          Ingenting syns för gästen förrän det godkänts här.
        </p>

        <nav className="mt-4 flex gap-2" aria-label="Filtrera">
          {[
            { value: "PENDING", label: "Väntar" },
            { value: "APPROVED", label: "Godkänd" },
            { value: "REJECTED", label: "Avvisad" },
          ].map((choice) => (
            <a
              key={choice.value}
              href={`/backoffice/media?status=${choice.value}`}
              aria-current={status === choice.value ? "page" : undefined}
              className={`min-h-9 rounded-full px-3.5 py-1.5 text-sm ${
                status === choice.value
                  ? "bg-burp-600 font-medium text-white"
                  : "border border-black/15 dark:border-white/20"
              }`}
            >
              {choice.label}
            </a>
          ))}
        </nav>

        {media.length === 0 ? (
          <p className="mt-8 opacity-60">
            {status === "PENDING"
              ? "Inget väntar på granskning."
              : "Ingen media med den statusen."}
          </p>
        ) : (
          <MediaQueue media={media} canWrite={admin.role !== "support"} />
        )}
      </main>
    </>
  );
}
