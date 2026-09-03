import type { Metadata } from "next";
import { Images, ImageOff } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PlatformHeader } from "@/components/platform/platform-header";
import { MediaQueue } from "@/components/platform/media-queue";
import { DocumentQueue, type ModeratedDocument } from "@/components/platform/document-queue";
import { AvatarQueue, type PendingAvatar } from "@/components/platform/avatar-queue";
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
  /** Restaurangens bildjustering (migration 0063). Kön visar det gästen ser. */
  adjust: unknown;
}

interface PageProps {
  searchParams: Promise<{ status?: string }>;
}

export default async function MediaPage({ searchParams }: PageProps) {
  const admin = await requirePlatformAdmin();
  const params = await searchParams;

  /*
    * Frågesträngen är gästens att skriva, och `.includes()` smalnar inte av en
    * sträng åt TypeScript. Listan är därför typad och kontrollen ett riktigt
    * typvakt-uttryck — ett okänt värde faller på "PENDING" i stället för att
    * skickas vidare till en enum-kolumn.
    */
  const MEDIA_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
  type MediaStatus = (typeof MEDIA_STATUSES)[number];

  const isMediaStatus = (value: string | undefined): value is MediaStatus =>
    MEDIA_STATUSES.includes(value as MediaStatus);

  const status: MediaStatus = isMediaStatus(params.status) ? params.status : "PENDING";

  const supabase = await createClient();

  const { data: rows } = await supabase
    .from("media")
    .select(
      "id, kind, status, storage_path, playback_url, poster_url, alt_text, rejection_reason, created_at, restaurant_id, menu_item_id, focal_x, focal_y, brightness, contrast, saturation",
    )
    .eq("status", status)
    .order("created_at", { ascending: true });

  /*
   * Dokumenten granskas i samma vy och med samma statusfilter.
   *
   * Egen tabell (migration 0064) men samma beslut: Burp står som värd för det
   * som ligger på en indexerad sida. Att lägga dem i en egen vy hade betytt två
   * köer att komma ihåg att titta i, och den ena hade blivit den som glöms.
   */
  const { data: documentRows } = await supabase
    .from("restaurant_documents")
    .select("id, title, status, storage_path, size_bytes, created_at, restaurant_id, rejection_reason")
    .eq("status", status)
    .order("created_at", { ascending: true });

  // Namnen hämtas separat. En join hade gått, men media kan peka på en rätt
  // som hunnit tas bort, och då ska raden ändå gå att moderera.
  const restaurantIds = [
    ...new Set([
      ...(rows ?? []).map((row) => row.restaurant_id),
      ...(documentRows ?? []).map((row) => row.restaurant_id),
    ]),
  ];
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
  const documentBase = `${publicEnv.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/restaurant-docs/`;

  /*
   * Gästbilder som väntar (migration 0068).
   *
   * Alltid de väntande, oavsett statusfiltret ovan. Filtret hör till
   * restaurangernas media; en gästbild har bara ett läge som kräver en
   * handling, och en kö som göms bakom ett filter är en kö som glöms.
   */
  const { data: avatarRows } = await supabase.rpc("pending_avatars");

  const avatars: PendingAvatar[] = (avatarRows ?? []).map((row) => ({
    userId: row.user_id,
    url: `${publicEnv.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/guest-avatars/${row.avatar_path}`,
    since: row.since,
  }));


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
    /*
     * Granskningen ska se det gästen ser.
     *
     * Utan justeringen godkänner Burp en bild och restaurangen visar en annan
     * — inom ±15 %, men ändå en annan. Att kön visar originalet vore samma
     * sorts halva koppling som gjorde `tips` till ett skal fram till 0040.
     */
    adjust: {
      focal_x: row.focal_x,
      focal_y: row.focal_y,
      brightness: row.brightness,
      contrast: row.contrast,
      saturation: row.saturation,
    },
  }));

  const documents: ModeratedDocument[] = (documentRows ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    status: row.status,
    url: `${documentBase}${row.storage_path}`,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at,
    restaurantName: restaurantName.get(row.restaurant_id) ?? "Okänd restaurang",
    rejectionReason: row.rejection_reason,
  }));

  return (
    <>
      <PlatformHeader admin={admin} current="media" />

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <h1 className="font-display text-4xl">Media</h1>
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
              className={`min-h-9 px-3.5 py-1.5 text-sm ${
                status === choice.value
                  ? "bg-burp-600 font-medium text-white"
                  : "border border-[var(--rule)]"
              }`}
            >
              {choice.label}
            </a>
          ))}
        </nav>

        {media.length === 0 ? (
          <div className="mt-8">
            <EmptyState
              icon={status === "PENDING" ? ImageOff : Images}
              title={
                status === "PENDING" ? "Inget väntar på granskning" : "Ingen media med den statusen"
              }
              body={
                status === "PENDING"
                  ? "Kön är tom. Nya bilder från restaurangerna dyker upp här."
                  : "Byt status ovan för att se de andra köerna."
              }
            />
          </div>
        ) : (
          <MediaQueue media={media} canWrite={admin.role !== "support"} />
        )}

        <h2 className="font-display mt-12 text-2xl">Dokument</h2>
        <p className="mt-1 text-sm opacity-70">
          PDF från restaurangerna. Menyn ligger aldrig här — den är data.
        </p>

        {avatars.length > 0 ? (
          <>
            <h2 className="font-display mt-12 text-2xl">Gästbilder</h2>
            <p className="mt-1 text-sm opacity-70">
              Gästen har valt att visa bilden på sina omdömen. Kön visar bilden och
              ingenting annat — granskaren ska bedöma ett ansikte, inte läsa en profil.
            </p>

            <AvatarQueue avatars={avatars} canWrite={admin.role !== "support"} />
          </>
        ) : null}

        {documents.length === 0 ? (
          <p className="mt-4 text-sm opacity-60">
            {status === "PENDING"
              ? "Inga dokument väntar på granskning."
              : "Inga dokument med den statusen."}
          </p>
        ) : (
          <DocumentQueue documents={documents} canWrite={admin.role !== "support"} />
        )}
      </main>
    </>
  );
}
