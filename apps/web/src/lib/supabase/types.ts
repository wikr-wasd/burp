import type { Database, Json } from "./database.types";

/**
 * Genvägar in i de genererade schematyperna.
 *
 * Klienterna är typade med `Database` sedan 2026-08-22, och det gör varje
 * `.select("kolumn_som_inte_finns")` till ett byggfel i stället för något
 * `smoke.sh` får hitta i efterhand. Det visade direkt fyra riktiga fel — se
 * `docs/TODO.md` — och de här aliasen finns för att den strängheten ska gå att
 * använda i stället för att kringgås.
 *
 * `Record<string, unknown>` är den vanliga genvägen när en uppdatering byggs
 * fältvis, och den kastar bort precis det skyddet. `TableUpdate<"orders">` gör
 * samma sak utan att blunda.
 */

export type TableRow<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

export type TableInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];

export type TableUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];

export type { Json };

/**
 * Ett argument till en databasfunktion som får vara NULL.
 *
 * Supabase typgenerator skriver VARJE funktionsparameter som icke-nullbar,
 * oavsett vad SQL:en säger — och i Postgres är varje parameter nullbar om
 * inget annat anges. `redeem_coupon(p_guest_id uuid)` tar emot null och gör
 * rätt sak med det: en anonym bordsgäst har inget konto, och det är hela
 * poängen med QR-flödet.
 *
 * Funktionen finns för att den lögnen ska ha ett namn. Ett naket `as string`
 * på tio ställen läser som slarv; det här läser som vad det är.
 */
export function nullableArg<T>(value: T | null): T {
  return value as T;
}

/**
 * Ett värde på väg in i en `jsonb`-kolumn.
 *
 * Generatorn typar dem som `Json`, vilket är en rekursiv union av det JSON kan
 * innehålla. Ett vanligt objekt med kända fält — en orderpolicy, en lista med
 * bordskoordinater — uppfyller den strukturellt men går inte att tilldela utan
 * hjälp, eftersom TypeScript inte räknar ut det åt oss för indexsignaturer.
 *
 * Kravet som INTE tas bort: värdet måste faktiskt gå att serialisera. Den som
 * skickar en funktion eller ett Date-objekt hit får ett fel från databasen i
 * stället för från bygget, och det är den enda vägen kvar.
 */
export function asJson(value: unknown): Json {
  return value as Json;
}
