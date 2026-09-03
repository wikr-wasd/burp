import "server-only";

import { createClient } from "./supabase/server";
import { publicEnv } from "./env";

/**
 * Omdömen (avsnitt 7).
 *
 * Alla betyg här är kopplade till en genomförd order — det enforcas av
 * `reviews_require_completed_order` i migration 0010. Det är den kopplingen
 * som gör att `AggregateRating` på restaurangsidorna får publiceras: Google
 * kräver att betyg går att härleda till riktiga köp, och en plattform som
 * publicerar annat riskerar en manuell åtgärd mot hela domänen.
 */

export interface PublicReview {
  id: string;
  ratingFood: number;
  ratingService: number | null;
  ratingDelivery: number | null;
  comment: string | null;
  createdAt: string;
  response: string | null;
  respondedAt: string | null;
  /**
   * Alltid null. Omdömen är pseudonyma, och det är ett beslut — inte en lucka.
   *
   * Fältet fanns för att visa skribentens förnamn, och uppslaget mot
   * `profiles` gjordes via RLS-klienten. Policyn `profiles_select_own` släpper
   * bara igenom din EGEN rad, så frågan returnerade alltid tomt: varje omdöme
   * visade reservtexten ändå. Utfallet var rätt, men koden såg ut att mena
   * motsatsen — och nästa person som undrade varför namnet aldrig syns hade en
   * uppenbar "fix": byt till `createAdminClient()`. Då publiceras varje
   * recensents riktiga namn på en indexerad sida, och ingen policy stoppar det.
   *
   * Uppslaget är borttaget 2026-08-22 och beslutet skrivet i stället. Ska
   * namnet visas är vägen ett eget visningsnamn gästen själv väljer att
   * publicera — inte hennes profilnamn. Se docs/TODO.md.
   *
   * Fältet står kvar i typen så att gränssnitten inte behöver ändras den dagen
   * ett sådant namn finns.
   */
  authorName: null;
  /**
   * Skribentens bild, men bara när hon VALT att visa den och Burp granskat den.
   *
   * Samma princip som `authorName`, med motsatt utfall: namnet visas inte
   * eftersom hon aldrig sagt ja, bilden visas eftersom hon uttryckligen har
   * det. `avatar_public` är NEJ tills hon säger något annat — bilden i
   * migration 0067 laddades upp under löftet att bara hon ser den.
   *
   * Null för QR-gästen, som inte har något konto alls.
   */
  authorAvatarUrl: string | null;
}

/**
 * Publicerade omdömen för en restaurang.
 *
 * Pseudonyma. Skribenten står som "Gäst" — se `authorName`. Ett omdöme är
 * knutet till ett riktigt köp av en riktig person, men gästen har aldrig sagt
 * ja till att hennes namn publiceras på en indexerad sida.
 */
export async function getPublicReviews(restaurantId: string, limit = 20): Promise<PublicReview[]> {
  const supabase = await createClient();

  const { data: rows } = await supabase
    .from("reviews")
    .select(
      "id, user_id, rating_food, rating_service, rating_delivery, comment, created_at, response, responded_at",
    )
    .eq("restaurant_id", restaurantId)
    .eq("is_published", true)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!rows || rows.length === 0) return [];

  /*
   * Bilderna hämtas med en funktion som ger ut ETT fält.
   *
   * En select-policy på `profiles` för anon hade varit den uppenbara vägen och
   * ett allvarligt fel: RLS är radnivå, inte kolumnnivå, så en policy som
   * släpper igenom raden släpper igenom `email`, `phone` och `birth_date` med
   * den. `public_avatar_paths()` (migration 0068) är security definer och
   * returnerar bara sökvägen, för dem som valt att visa den.
   */
  const authorIds = [...new Set(rows.map((row) => row.user_id).filter((id): id is string => id !== null))];

  const avatarByUser = new Map<string, string>();

  if (authorIds.length > 0) {
    const { data: avatars } = await supabase.rpc("public_avatar_paths", {
      p_user_ids: authorIds,
    });

    for (const row of avatars ?? []) {
      if (row.avatar_path) {
        avatarByUser.set(
          row.user_id,
          `${publicEnv.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/guest-avatars/${row.avatar_path}`,
        );
      }
    }
  }

  return rows.map((row) => ({
    id: row.id,
    ratingFood: row.rating_food,
    ratingService: row.rating_service,
    ratingDelivery: row.rating_delivery,
    comment: row.comment,
    createdAt: row.created_at,
    response: row.response,
    respondedAt: row.responded_at,
    authorName: null,
    authorAvatarUrl: row.user_id ? (avatarByUser.get(row.user_id) ?? null) : null,
  }));
}

/* ── Restaurangens vy ────────────────────────────────────────────────────── */

export interface StaffReview extends PublicReview {
  isPublished: boolean;
  orderId: string;
}

export async function getReviewsForStaff(restaurantId: string): Promise<StaffReview[]> {
  const supabase = await createClient();

  const { data: rows } = await supabase
    .from("reviews")
    .select(
      "id, order_id, rating_food, rating_service, rating_delivery, comment, created_at, response, responded_at, is_published",
    )
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: false });

  if (!rows || rows.length === 0) return [];

  return rows.map((row) => ({
    id: row.id,
    orderId: row.order_id,
    ratingFood: row.rating_food,
    ratingService: row.rating_service,
    ratingDelivery: row.rating_delivery,
    comment: row.comment,
    createdAt: row.created_at,
    response: row.response,
    respondedAt: row.responded_at,
    isPublished: row.is_published,
    authorName: null,
    /*
     * Restaurangens egen vy visar ingen bild.
     *
     * Inte av integritetsskäl — har gästen valt att publicera den ser
     * restaurangen den ändå på sin publika sida. Skälet är att den här listan
     * finns för att moderera och svara, och ett ansikte bredvid varje rad
     * flyttar blicken från texten till personen.
     */
    authorAvatarUrl: null,
  }));
}
