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
   * Namnet gästen VALT att publicera, eller null.
   *
   * Aldrig hennes profilnamn — beslutet från 2026-08-22 står kvar och är hela
   * skälet till att kolumnen är egen. Uppslaget mot `profiles` gjordes en gång
   * via RLS-klienten och returnerade alltid tomt, eftersom
   * `profiles_select_own` bara släpper igenom den egna raden. Utfallet var
   * rätt men koden såg ut att mena motsatsen, och nästa "fix" hade varit att
   * byta till service role — varpå varje recensents riktiga namn hamnat på en
   * indexerad sida.
   *
   * `display_name` (migration 0069) är vad hon valt att kalla sig offentligt.
   * Null betyder att hon inte valt något, och omdömet står som "Gäst" som
   * förut. Det är fortfarande det vanliga fallet: QR-gästen har inget konto.
   */
  authorName: string | null;
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
  const nameByUser = new Map<string, string>();

  if (authorIds.length > 0) {
    /*
     * Två funktioner och inte en, därför att villkoren skiljer sig.
     *
     * Bilden kräver att gästen valt att visa den OCH att Burp granskat den.
     * Namnet kräver bara att hon skrivit ett — text från gäster publiceras
     * redan osedd i `comment`, och en kö för namnet hade varit teater medan
     * den större ytan går igenom.
     */
    const [avatars, names] = await Promise.all([
      supabase.rpc("public_avatar_paths", { p_user_ids: authorIds }),
      supabase.rpc("public_display_names", { p_user_ids: authorIds }),
    ]);

    for (const row of avatars.data ?? []) {
      if (row.avatar_path) {
        avatarByUser.set(
          row.user_id,
          `${publicEnv.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/guest-avatars/${row.avatar_path}`,
        );
      }
    }

    for (const row of names.data ?? []) {
      if (row.display_name) nameByUser.set(row.user_id, row.display_name);
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
    authorName: row.user_id ? (nameByUser.get(row.user_id) ?? null) : null,
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
    // Personalens vy är till för att moderera och svara, inte för att lära
    // känna gästen. Namnet hämtas inte här av samma skäl som bilden inte gör
    // det — se kommentaren nedan.
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
