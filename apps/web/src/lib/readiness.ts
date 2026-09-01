/**
 * Vilka delar av Burp som faktiskt är NÅBARA, inte bara byggda.
 *
 * ── Varför den här modulen finns ────────────────────────────────────────────
 *
 * Tvåstegsverifieringen låg död från 2026-08-22 till 2026-09-01. Schemat,
 * RLS-grinden, panelen, återställningen i backoffice och omdirigeringen i
 * proxy:n fungerade var för sig — men Supabase hade TOTP avstängt, så ingen
 * kunde registrera en faktor. Ingenting i produkten sa det. Panelen visade
 * samma allmänna felmeddelande som för ett nätverksfel.
 *
 * Det är inte ett engångsfel utan en form: **en funktion kan vara fullt byggd
 * och helt avstängd på en rad i miljön.** Webbpush har legat så sedan migration
 * 0050, brev sedan `sendEmail()` skrevs, kortbetalning sedan Stripe-adaptern
 * blev klar. Var och en av dem går tyst — koden gör det den ska, det finns
 * bara ingen nyckel att göra det med.
 *
 * Den här listan är svaret. Ett ställe som säger vad som är påslaget, vad som
 * är avstängt och var man sätter det.
 *
 * ── Ren funktion, med flit ──────────────────────────────────────────────────
 *
 * `capabilities()` tar miljön som ett argument i stället för att läsa
 * `process.env` själv. Det gör den prövbar utan att sätta variabler i ett
 * test, och det är därför den ligger här och inte i route handlern.
 *
 * ── Tre lägen, inte två ─────────────────────────────────────────────────────
 *
 * `off` är ett medvetet läge: funktionen är avstängd och beter sig som om den
 * inte fanns. `degraded` är farligare — halvt konfigurerad, alltså något som
 * ser påslaget ut och ändå inte fungerar. Ett halvt VAPID-par är det tydligaste
 * exemplet: den publika nyckeln ligger i webbläsarens prenumeration, och byts
 * den privata ensam blir varje registrerad enhet onåbar utan att något syns.
 *
 * ── Vad som INTE går att läsa här ───────────────────────────────────────────
 *
 * Tvåstegsverifieringen. Supabase `/auth/v1/settings` rapporterar inte om TOTP
 * är påslaget, och det finns ingen oautentiserad väg att fråga. Den bevisas i
 * stället av `smoke.sh`, som registrerar en riktig faktor och verifierar en
 * kod. Att lista den här med ett gissat läge hade varit sämre än att inte
 * lista den alls.
 */

export type ReadinessLevel = "live" | "degraded" | "off";

export interface Capability {
  /** Stabil nyckel för maskinläsning. Ändras inte när namnet skrivs om. */
  key: string;
  /** Svenska. Ytan är backoffice, som är Burps egen. */
  name: string;
  level: ReadinessLevel;
  /** Vad som gäller just nu, i klartext. */
  detail: string;
  /** Var det sätts. Utelämnas när det inte finns något att sätta. */
  fix?: string;
  /** Hindrar den här luckan en skarp lansering? */
  blocksLaunch: boolean;
}

/**
 * Miljön som listan läser.
 *
 * Rena strängar, inga `z`-scheman: modulen ska gå att anropa med en
 * handskriven karta i ett test lika gärna som med `serverEnv()`.
 */
export interface ReadinessEnv {
  vapidPublicKey?: string;
  vapidPrivateKey?: string;
  resendApiKey?: string;
  opsEmail?: string;
  stripeSecretKey?: string;
  stripePublishableKey?: string;
  stripeWebhookSecret?: string;
  cronSecret?: string;
  qrTokenSecret?: string;
  mapTileUrl?: string;
  sentryDsn?: string;
}

const set = (value?: string): boolean => typeof value === "string" && value.trim() !== "";

/**
 * OpenStreetMaps egna rutservrar.
 *
 * Standardvärdet, och det enda värde som är fel i produktion: deras
 * användarvillkor tillåter inte en publik tjänst. Se öppen fråga 8.
 */
const OSM_TILES = "tile.openstreetmap.org";

export function capabilities(env: ReadinessEnv): Capability[] {
  const list: Capability[] = [];

  // ── QR-beställning ────────────────────────────────────────────────────────
  //
  // Produktens kärna. Utan hemligheten går inga bordstoken att signera, och
  // hela flödet vid bordet är dött — inte degraderat.
  list.push(
    set(env.qrTokenSecret)
      ? {
          key: "qr",
          name: "QR-beställning vid bordet",
          level: "live",
          detail: "Bordstoken signeras. Utskrivna dekaler fungerar.",
          blocksLaunch: false,
        }
      : {
          key: "qr",
          name: "QR-beställning vid bordet",
          level: "off",
          detail: "QR_TOKEN_SECRET saknas — inga bordslänkar går att signera eller läsa.",
          fix: "QR_TOKEN_SECRET i miljön. Byts den i produktion slutar ALLA utskrivna dekaler att fungera.",
          blocksLaunch: true,
        },
  );

  // ── Webbpush ──────────────────────────────────────────────────────────────
  const hasPublic = set(env.vapidPublicKey);
  const hasPrivate = set(env.vapidPrivateKey);

  list.push(
    hasPublic && hasPrivate
      ? {
          key: "push",
          name: "Notiser till gästens telefon",
          level: "live",
          detail: "VAPID-paret finns. Gästen kan slå på notiser på /konto/uppgifter.",
          blocksLaunch: false,
        }
      : hasPublic !== hasPrivate
        ? {
            key: "push",
            name: "Notiser till gästens telefon",
            level: "degraded",
            detail:
              "Bara halva VAPID-paret är satt. Prenumerationer som redan finns blir onåbara, och pushtjänsten svarar 403 utan att något syns i appen.",
            fix: "Ta bort raden som står kvar och kör `node scripts/write-local-env.mjs`, eller sätt BÅDA i Vercel.",
            blocksLaunch: true,
          }
        : {
            key: "push",
            name: "Notiser till gästens telefon",
            level: "off",
            detail:
              "VAPID-nycklar saknas. Gästen får sitt besked som brev i stället — om brev är påslaget.",
            fix: "`node scripts/write-local-env.mjs` genererar ett par lokalt. Produktionen behöver ett eget.",
            blocksLaunch: false,
          },
  );

  // ── Brev ──────────────────────────────────────────────────────────────────
  //
  // Utan nyckel skriver `sendEmail()` bara i loggen. Det är avsiktligt och
  // rätt lokalt — men i produktion betyder det att gästen aldrig får sin
  // orderbekräftelse, och att köket aldrig får sitt brev om en ny order.
  list.push(
    set(env.resendApiKey)
      ? {
          key: "email",
          name: "Brev till gäster och restauranger",
          level: "live",
          detail: "Brev skickas. Avsändaren måste ligga på en verifierad domän hos leverantören.",
          blocksLaunch: false,
        }
      : {
          key: "email",
          name: "Brev till gäster och restauranger",
          level: "off",
          detail:
            "RESEND_API_KEY saknas — varje brev skrivs i loggen i stället för att skickas. Gäller orderbekräftelser, bokningar och gästens besked.",
          fix: "RESEND_API_KEY och NOTIFY_FROM i miljön.",
          blocksLaunch: true,
        },
  );

  // ── Restaurangansökningar ────────────────────────────────────────────────
  //
  // Egen rad och inte en del av brevraden: en påslagen brevleverantör utan
  // mottagaradress skickar ansökan till ingen, och det är en tystnad som ser
  // ut som att ingen ansöker.
  list.push(
    set(env.opsEmail)
      ? {
          key: "ops-email",
          name: "Restaurangansökningar når Burp",
          level: "live",
          detail: "Ansökningar går till BURP_OPS_EMAIL.",
          blocksLaunch: false,
        }
      : {
          key: "ops-email",
          name: "Restaurangansökningar når Burp",
          level: "off",
          detail:
            "BURP_OPS_EMAIL saknas. En restaurang som ansöker får kvittens, men ingen hos Burp får veta om det.",
          fix: "BURP_OPS_EMAIL i miljön.",
          blocksLaunch: true,
        },
  );

  // ── Kortbetalning ────────────────────────────────────────────────────────
  //
  // Utan nycklar visar QR-kassan bara "betala på plats". Det är korrekt
  // beteende och inte ett fel — men det är ett annat beteende än det avsedda,
  // och skillnaden ska synas här och inte upptäckas av en gäst.
  const stripeParts = [env.stripeSecretKey, env.stripePublishableKey, env.stripeWebhookSecret];
  const stripeSet = stripeParts.filter(set).length;

  list.push(
    stripeSet === 3
      ? {
          key: "card",
          name: "Kortbetalning i appen",
          level: "live",
          detail: "Stripe är konfigurerat. Gäller där Stripe finns — HR och SE.",
          blocksLaunch: false,
        }
      : stripeSet === 0
        ? {
            key: "card",
            name: "Kortbetalning i appen",
            level: "off",
            detail:
              "Stripe-nycklar saknas. Kassan visar bara betala på plats, vilket är korrekt beteende utan nycklar.",
            fix: "STRIPE_SECRET_KEY, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY och STRIPE_WEBHOOK_SECRET.",
            blocksLaunch: false,
          }
        : {
            key: "card",
            name: "Kortbetalning i appen",
            level: "degraded",
            detail: `Bara ${stripeSet} av 3 Stripe-nycklar är satta. Saknas webhook-hemligheten bokförs betalningar aldrig som genomförda.`,
            fix: "Sätt alla tre, eller ta bort dem alla.",
            blocksLaunch: true,
          },
  );

  // ── Bakgrundsjobben ──────────────────────────────────────────────────────
  list.push(
    set(env.cronSecret)
      ? {
          key: "jobs",
          name: "Bakgrundsjobb (notiskö, utgångna poäng)",
          level: "live",
          detail: "Jobben går att trigga. Takten sätts av crons i vercel.json.",
          blocksLaunch: false,
        }
      : {
          key: "jobs",
          name: "Bakgrundsjobb (notiskö, utgångna poäng)",
          level: "off",
          detail:
            "CRON_SECRET saknas — /api/jobs svarar 503 i stället för att köra öppet. Notiskön töms aldrig och poäng bokförs aldrig som utgångna.",
          fix: "CRON_SECRET i miljön. Vercel sätter den när cron-jobbet läggs upp.",
          blocksLaunch: true,
        },
  );

  // ── Kartrutor ────────────────────────────────────────────────────────────
  const tiles = env.mapTileUrl ?? "";

  list.push(
    !set(tiles) || tiles.includes(OSM_TILES)
      ? {
          key: "map",
          name: "Kartrutor",
          level: "degraded",
          detail:
            "Rutorna hämtas från OpenStreetMaps egna servrar. Deras villkor tillåter inte en publik tjänst — kartan fungerar, men får inte användas skarpt.",
          fix: "En leverantör, t.ex. MapTiler. Bytet är NEXT_PUBLIC_MAP_TILE_URL och NEXT_PUBLIC_MAP_TILE_ATTRIBUTION — ingen kod. Öppen fråga 8.",
          blocksLaunch: true,
        }
      : {
          key: "map",
          name: "Kartrutor",
          level: "live",
          detail: "Rutorna hämtas från en egen leverantör.",
          blocksLaunch: false,
        },
  );

  // ── Felrapportering ──────────────────────────────────────────────────────
  list.push(
    set(env.sentryDsn)
      ? {
          key: "errors",
          name: "Felrapportering från produktion",
          level: "live",
          detail: "Fel rapporteras.",
          blocksLaunch: false,
        }
      : {
          key: "errors",
          name: "Felrapportering från produktion",
          level: "off",
          detail:
            "Ingenting rapporterar fel. Ett fel i en route handler syns i Vercels logg om någon råkar titta, och aldrig annars.",
          fix: "En DSN i miljön. Gratisnivån räcker länge.",
          blocksLaunch: true,
        },
  );

  return list;
}

export interface ReadinessSummary {
  live: number;
  degraded: number;
  off: number;
  /** Antal luckor som hindrar en skarp lansering. */
  blocking: number;
}

export function summarise(list: readonly Capability[]): ReadinessSummary {
  return {
    live: list.filter((c) => c.level === "live").length,
    degraded: list.filter((c) => c.level === "degraded").length,
    off: list.filter((c) => c.level === "off").length,
    blocking: list.filter((c) => c.level !== "live" && c.blocksLaunch).length,
  };
}
