import { z } from "zod";
import { ORDER_STATUSES, ORDER_TYPES, STAFF_ROLES } from "./types";
import { TOKEN_LENGTH } from "./qr";

/**
 * Valideringsscheman. Allt som kommer utifrån — formulär, API-anrop, webhooks —
 * passerar ett schema här innan det får röra databasen.
 *
 * Samma scheman används av webben, appen och route handlers, så en regel som
 * skärps gäller överallt samtidigt.
 */

/**
 * Id-validering.
 *
 * `z.guid()` och inte `z.uuid()`. Den senare kräver en RFC-korrekt versions-
 * och variantbit, och avvisar därmed id:n som databasen accepterar utan
 * invändning — till exempel de läsbara id:n i seed-datan, eller ett id som
 * kommer från ett kassasystem med egen generator.
 *
 * Vi validerar formen för att avvisa uppenbart skräp innan det når databasen.
 * Att ett id existerar avgörs av främmande nycklar, inte av ett regex.
 */
export const uuidSchema = z.guid();

/** Belopp i öre. Aldrig decimaler, aldrig negativa i inkommande data. */
export const oreSchema = z.int().min(0).max(100_000_000);

export const bpsSchema = z.int().min(0).max(10_000);

/** Slug för URL:er: burp.se/r/malmo/{slug} */
export const slugSchema = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug får bara innehålla små bokstäver, siffror och bindestreck");

/** Svenskt organisationsnummer, 10 siffror med valfritt bindestreck. */
export const orgNumberSchema = z
  .string()
  .regex(/^\d{6}-?\d{4}$/, "Organisationsnummer ska vara 10 siffror, t.ex. 556677-8899")
  .transform((value) => value.replace("-", ""));

export const qrTokenSchema = z
  .string()
  .length(TOKEN_LENGTH)
  .regex(/^[0-9A-HJKMNP-TV-Z]+$/i, "Ogiltigt bordstoken")
  .transform((value) => value.toUpperCase());

export const staffRoleSchema = z.enum(STAFF_ROLES);
export const orderStatusSchema = z.enum(ORDER_STATUSES);
export const orderTypeSchema = z.enum(ORDER_TYPES);

/* ── Orderregler ─────────────────────────────────────────────────────────── */

export const orderPolicySchema = z.object({
  edit_window_seconds: z.int().min(0).max(3600).default(120),
  editable_until_status: orderStatusSchema.default("ACCEPTED"),
  allow_add_items: z.boolean().default(true),
  allow_remove_items: z.boolean().default(true),
  allow_change_options: z.boolean().default(false),
  allow_cancel_until_status: orderStatusSchema.default("PREPARING"),
  auto_accept: z.boolean().default(false),
  prep_time_minutes: z.int().min(1).max(240).default(20),
  allow_scheduled_orders: z.boolean().default(false),
});

/* ── Order som skickas in ────────────────────────────────────────────────── */

export const orderItemOptionInputSchema = z.object({
  option_id: uuidSchema,
});

export const orderItemInputSchema = z.object({
  menu_item_id: uuidSchema,
  quantity: z.int().min(1).max(99),
  options: z.array(orderItemOptionInputSchema).max(20).default([]),
  /** Fritext till köket, t.ex. "utan lök". */
  note: z.string().max(280).optional(),
});

/**
 * Det klienten får skicka när en order skapas.
 *
 * Lägg märke till vad som INTE finns här: inga priser. Klienten skickar bara
 * VAD som beställs — servern hämtar priserna ur menyn och räknar själv
 * (avsnitt 12). `client_total_ore` är valfri och används enbart som kontroll:
 * stämmer den inte med serverns summa avbryts ordern.
 */
export const createOrderSchema = z
  .object({
    type: orderTypeSchema,
    /** Krävs när type === "TABLE". */
    table_token: qrTokenSchema.optional(),
    items: z.array(orderItemInputSchema).min(1).max(100),
    tip_ore: oreSchema.default(0),
    /**
     * Vilken procentsats gästen tryckte på, i baspunkter. 1000 = 10 %.
     *
     * Valfri, och aldrig ett pris: beloppet står i `tip_ore` och kontrolleras
     * mot den här satsen på servern. Stämmer de inte lagras valet som ett
     * belopp, vilket är sanningen — se migration 0077.
     *
     * Utelämnas när gästen skrev ett eget belopp eller inte gav dricks.
     */
    tip_bps: z.int().min(0).max(10000).optional(),
    note: z.string().max(500).optional(),
    /** ISO 8601. Kräver att restaurangen tillåter schemalagda order. */
    scheduled_for: z.iso.datetime({ offset: true }).optional(),
    client_total_ore: oreSchema.optional(),
    /**
     * Idempotensnyckel (avsnitt 12). Två anrop med samma nyckel ger samma
     * order — dubbeltryck på "Beställ" får aldrig bli två notor.
     */
    idempotency_key: uuidSchema,
    /**
     * Hur gästen vill betala. `CASH` betyder "på plats" och är standardvägen —
     * den fungerar i hela regionen och kräver ingen leverantör.
     *
     * Lägg märke till att det här är ett betalSÄTT, inte en leverantör. Vilken
     * inlösare ett kort går genom avgörs av restaurangens betalkonto, aldrig av
     * klienten och aldrig av landet i en komponent.
     */
    payment_method: z.enum(["CASH", "CARD"]).default("CASH"),
    /**
     * En kupongKOD, aldrig ett rabattbelopp.
     *
     * Samma regel som priset: servern slår upp kupongen, kontrollerar villkoren
     * och räknar rabatten själv. Skickade klienten beloppet vore varje kupong i
     * praktiken obegränsad.
     */
    coupon_code: z.string().min(3).max(40).optional(),
    /**
     * Presentkortets kod, aldrig ett belopp.
     *
     * Ett presentkort är betalmedel och inte rabatt: det sänker vad som
     * återstår att debitera, aldrig ordersumman. Servern räknar hur mycket av
     * kortet som får användas.
     */
    gift_card_code: z.string().min(4).max(40).optional(),
    /**
     * Lös ut klippkortet på den här ordern.
     *
     * En begäran, inte ett belopp. Servern räknar om antalet besök och avgör
     * själv om kortet är fullt — och vad belöningen är värd.
     */
    use_punch_card: z.boolean().default(false),
  })
  .refine((order) => order.type !== "TABLE" || order.table_token !== undefined, {
    message: "Bordsbeställning kräver ett bordstoken",
    path: ["table_token"],
  });

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

/* ── Meny ────────────────────────────────────────────────────────────────── */

export const menuItemSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(1000).optional(),
  price_ore: oreSchema,
  vat_rate_bps: bpsSchema.default(1200),
  /** Fritt textfält per allergen — EU:s 14 allergener plus restaurangens egna. */
  allergens: z.array(z.string().max(60)).max(30).default([]),
  is_available: z.boolean().default(true),
  sort_order: z.int().min(0).default(0),
});

/* ── Recension ───────────────────────────────────────────────────────────── */

/**
 * Recensioner kan bara lämnas på en genomförd order (avsnitt 7). Kopplingen
 * till `order_id` är det som stoppar falska recensioner — den enforcas i
 * databasen, inte bara här.
 */
export const reviewSchema = z.object({
  order_id: uuidSchema,
  rating_food: z.int().min(1).max(5),
  rating_service: z.int().min(1).max(5).optional(),
  rating_delivery: z.int().min(1).max(5).optional(),
  comment: z.string().max(2000).optional(),
});

/* ── Restaurang ──────────────────────────────────────────────────────────── */

export const restaurantSchema = z.object({
  name: z.string().min(1).max(160),
  slug: slugSchema,
  org_number: orgNumberSchema,
  city: z.string().min(1).max(80),
  address: z.string().min(1).max(240),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  order_policy: orderPolicySchema.optional(),
  /** Avgift i baspunkter för specialavtal. Null = standardavgiften gäller. */
  fee_override_bps: bpsSchema.nullable().default(null),
});
