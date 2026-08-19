/**
 * Klippkort — tionde besöket bjuder restaurangen på.
 *
 * En annan mekanik än lojalitetspoängen, och de ska inte blandas ihop. Poäng
 * räknar KRONOR: den som äter dyrt tjänar snabbare. Ett klippkort räknar
 * BESÖK: tio gånger är tio gånger, oavsett om det var en kaffe eller en
 * trerätters. Det är därför det fungerar på ett ställe man går till ofta.
 *
 * Antalet lagras aldrig. Det är en `count(*)` över gästens slutförda order hos
 * restaurangen — samma skäl som lojalitetssaldot inte lagras (regel 7): ett
 * lagrat antal kan hamna i otakt med sina order, en räkning över dem kan det
 * inte.
 *
 * Fungerar bara för inloggade gäster. En anonym QR-gäst går inte att räkna
 * besök på, och ska inte gå att räkna besök på — annars vore klippkortet ett
 * skäl att spåra den som valt att inte ha konto.
 */

/** Restaurangens standardkort när den slår på funktionen. */
export const DEFAULT_PUNCH_CARD_SIZE = 10;

export interface PunchCardState {
  /** Hur många besök som krävs. Restaurangen bestämmer. */
  size: number;
  /** Antal slutförda order sedan senaste belöningen. */
  visits: number;
  /** Hur många som återstår. Noll betyder att belöningen är intjänad. */
  remaining: number;
  /** Sant när nästa besök är gratis. */
  isEarned: boolean;
  /** Totalt antal inlösta belöningar. För "du har ätit gratis tre gånger". */
  rewardsRedeemed: number;
}

/**
 * Läget på gästens klippkort.
 *
 * `completedOrders` är alla slutförda order hos restaurangen, `rewardsRedeemed`
 * antalet gånger belöningen redan tagits ut. Klippen som räknas är de som ligger
 * efter senaste belöningen — annars hade den som ätit tjugo gånger stått med en
 * evigt intjänad belöning i stället för två uttagna och noll kvar.
 */
export function punchCardState(input: {
  size: number;
  completedOrders: number;
  rewardsRedeemed: number;
}): PunchCardState {
  const size = Math.max(1, Math.floor(input.size));
  const completed = Math.max(0, Math.floor(input.completedOrders));
  const redeemed = Math.max(0, Math.floor(input.rewardsRedeemed));

  const visits = Math.max(0, completed - redeemed * size);
  const isEarned = visits >= size;

  return {
    size,
    visits: isEarned ? size : visits,
    remaining: isEarned ? 0 : size - visits,
    isEarned,
    rewardsRedeemed: redeemed,
  };
}

/**
 * Är klippkortet påslaget?
 *
 * Null betyder av. Restaurangen som inte vill ha ett klippkort ska inte behöva
 * sätta storleken till noll och hoppas att koden tolkar det rätt.
 */
export function isPunchCardEnabled(size: number | null): size is number {
  return size !== null && size >= 2;
}

/**
 * Vad belöningen är värd på en viss order.
 *
 * Aldrig mer än maten kostar efter en eventuell kupong: klippkortet bjuder på
 * en måltid, inte på dricks eller leverans. Taket är restaurangens eget, för
 * den som vill bjuda på en måltid men inte på ett sällskap som beställer för
 * hela kvällen.
 *
 * Ligger i `@burp/core` och inte på servern därför att varukorgen måste kunna
 * räkna samma sak. Klienten skickar sin summa som kontroll, och en siffra som
 * räknas på två ställen med två formler avbryter beställningen med "priset har
 * ändrats" utan att någon förstår varför.
 */
export function punchCardReward(input: {
  itemsGrossOre: number;
  /** Redan avdragen rabatt, som ett POSITIVT belopp. */
  discountOre: number;
  maxRewardOre: number | null;
}): number {
  const remaining = Math.max(0, input.itemsGrossOre - Math.max(0, input.discountOre));
  return input.maxRewardOre === null ? remaining : Math.min(remaining, input.maxRewardOre);
}
