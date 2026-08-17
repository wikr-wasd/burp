import { z } from "zod";

/**
 * Miljövariabler valideras vid start i stället för att upptäckas som
 * `undefined` mitt i en betalning. En saknad nyckel ska stoppa bygget, inte en
 * order.
 *
 * NEXT_PUBLIC_* bakas in i klientbundlen. Allt annat finns bara på servern.
 * Next.js ersätter `process.env.NEXT_PUBLIC_X` statiskt vid bygge, därför
 * skrivs de ut i sin helhet nedan i stället för att slås upp dynamiskt.
 */

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  NEXT_PUBLIC_SITE_URL: z.url().default("http://localhost:3000"),

  /*
   * Kartrutorna på /upptack.
   *
   * Ligger i miljön och inte i koden därför att valet av leverantör är ett
   * öppet beslut. Standardvärdet är OpenStreetMaps egna servrar, vilket
   * fungerar i utveckling men INTE i produktion: OSM:s användningsvillkor
   * tillåter inte att en publik tjänst hämtar rutor därifrån.
   *
   * Byt till MapTiler, Stadia, Protomaps eller motsvarande innan lansering.
   * Bara de här två variablerna ändras — se docs/OPEN-QUESTIONS.md.
   */
  NEXT_PUBLIC_MAP_TILE_URL: z
    .string()
    .default("https://tile.openstreetmap.org/{z}/{x}/{y}.png"),
  NEXT_PUBLIC_MAP_TILE_ATTRIBUTION: z
    .string()
    .default('&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'),
});

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  QR_TOKEN_SECRET: z.string().min(32, "QR_TOKEN_SECRET ska vara minst 32 tecken"),
  BURP_DEFAULT_FEE_BPS: z.coerce.number().int().min(0).max(10_000).default(340),

  /*
   * Notiser.
   *
   * Frivilliga med flit. Utan nyckel skickas ingen e-post — utvecklingsmiljön
   * ska inte kräva ett konto hos en leverantör för att en order ska gå att
   * lägga, och en order får aldrig falla för att notisen inte kunde skickas.
   * `sendEmail()` svarar då NOT_CONFIGURED och skriver brevet i loggen.
   *
   * Avsändaren måste ligga på en domän som är verifierad hos leverantören.
   */
  RESEND_API_KEY: z.string().min(1).optional(),
  NOTIFY_FROM: z.string().min(3).default("Burp <notiser@burp.se>"),

  /* Burps egen adress — dit ansökningar från /anslut går. */
  BURP_OPS_EMAIL: z.email().optional(),
});

export const publicEnv = publicSchema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_MAP_TILE_URL: process.env.NEXT_PUBLIC_MAP_TILE_URL,
  NEXT_PUBLIC_MAP_TILE_ATTRIBUTION: process.env.NEXT_PUBLIC_MAP_TILE_ATTRIBUTION,
});

let cachedServerEnv: z.infer<typeof serverSchema> | null = null;

/**
 * Serverhemligheter. Läses lat så att importen aldrig kan dra in dem i en
 * klientbundle av misstag — anropas den från klienten kastar den i stället för
 * att läcka.
 */
export function serverEnv(): z.infer<typeof serverSchema> {
  if (typeof window !== "undefined") {
    throw new Error("serverEnv() får bara anropas på servern.");
  }
  if (!cachedServerEnv) {
    cachedServerEnv = serverSchema.parse(process.env);
  }
  return cachedServerEnv;
}
