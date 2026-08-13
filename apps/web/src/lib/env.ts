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
});

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  QR_TOKEN_SECRET: z.string().min(32, "QR_TOKEN_SECRET ska vara minst 32 tecken"),
  BURP_DEFAULT_FEE_BPS: z.coerce.number().int().min(0).max(10_000).default(340),
});

export const publicEnv = publicSchema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
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
