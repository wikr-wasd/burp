/**
 * Bordens egenskaper.
 *
 * ⚠️ Ligger HÄR och inte i `app/dashboard/bord/actions.ts`, och det är ingen
 * smaksak.
 *
 * Den filen börjar med `"use server"`, och en sådan modul får bara exportera
 * asynkrona funktioner. Allt annat som exporteras görs om till en referens till
 * en serveråtgärd — så en klientkomponent som importerade listan fick en
 * FUNKTION i stället för en array:
 *
 *   TypeError: TABLE_ATTRIBUTES.map is not a function
 *
 * Följden var att hela `/dashboard/bord` svarade 500. Felet syns inte i
 * typkontrollen, eftersom typen är rätt — omskrivningen sker i bundlern.
 *
 * Listan speglar check-villkoret i migration 0054. Egenskaperna kommer ur en
 * FAST lista och inte som fritext därför att de översätts: en gäst som bokar på
 * tyska ska se "Am Fenster", och tre restauranger som skriver "fönster",
 * "prozor" och "Fenster" hade blivit tre olika bord.
 */
export const TABLE_ATTRIBUTES = [
  "VIEW",
  "WINDOW",
  "OUTDOOR",
  "QUIET",
  "BOOTH",
  "ACCESSIBLE",
] as const;

export type TableAttribute = (typeof TABLE_ATTRIBUTES)[number];
