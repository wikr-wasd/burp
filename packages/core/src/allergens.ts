/**
 * Allergener som KODER, inte som fritext.
 *
 * ── Varför det här är viktigare än det ser ut ───────────────────────────────
 *
 * `CLAUDE.md` säger att bara gränssnittet översätts och att restaurangens egen
 * text står kvar som den skrivits — med ETT undantag: etiketten framför
 * allergenlistan, "därför att det är det enda stället på menyn där en gäst som
 * inte förstår riskerar något värre än en missad rätt".
 *
 * Men listan SJÄLV var fritext. I den lokala datan stod redan `mleko` och
 * `mlijeko` sida vid sida — samma allergen, två stavningar, två olika
 * restauranger. En svensk gäst i Sarajevo läste "mlijeko" och förstod
 * ingenting, och den som söker efter en rätt utan mjölk hittade hälften.
 *
 * Maskinöversättning är fel verktyg här. Den kan gissa, och en gissning om
 * nötter är inte ett svar man vill ge en allergiker. Koder översätts av vår
 * egen ordbok: exakt, gratis, och likadant varje gång.
 *
 * Listan är EU:s fjorton — de som enligt förordning 1169/2011 måste anges. Fler
 * går att lägga till; färre går inte, eftersom listan är ett lagkrav och inte
 * ett urval.
 */

export const ALLERGENS = [
  "GLUTEN",
  "CRUSTACEANS",
  "EGGS",
  "FISH",
  "PEANUTS",
  "SOY",
  "MILK",
  "NUTS",
  "CELERY",
  "MUSTARD",
  "SESAME",
  "SULPHITES",
  "LUPIN",
  "MOLLUSCS",
] as const;

export type Allergen = (typeof ALLERGENS)[number];

export function isAllergen(value: string): value is Allergen {
  return (ALLERGENS as readonly string[]).includes(value);
}

/**
 * Fritext → kod, för det som redan står i databasen.
 *
 * Nycklarna är gemener utan diakriter. Listan täcker de fem språken plus de
 * stavningar som faktiskt förekommer i datan — `mlijeko` och `mleko` är samma
 * mjölk på bosniska respektive serbiska.
 *
 * Det som INTE går att tolka faller bort i stället för att gissas. En rätt som
 * tappar en allergen är fel; en rätt som får FEL allergen är farligare, och en
 * gissning är precis det.
 */
const SYNONYMS: Record<string, Allergen> = {
  // Gluten
  gluten: "GLUTEN", vete: "GLUTEN", wheat: "GLUTEN", weizen: "GLUTEN", psenica: "GLUTEN",
  // Skaldjur
  skaldjur: "CRUSTACEANS", crustaceans: "CRUSTACEANS", krebstiere: "CRUSTACEANS", rakovi: "CRUSTACEANS",
  // Ägg
  agg: "EGGS", egg: "EGGS", eggs: "EGGS", ei: "EGGS", eier: "EGGS", jaja: "EGGS", jaje: "EGGS",
  // Fisk
  fisk: "FISH", fish: "FISH", riba: "FISH",
  // Jordnötter
  jordnotter: "PEANUTS", peanuts: "PEANUTS", erdnusse: "PEANUTS", kikiriki: "PEANUTS",
  // Soja
  soja: "SOY", soy: "SOY", soya: "SOY",
  // Mjölk
  mjolk: "MILK", milk: "MILK", milch: "MILK", melk: "MILK", mlijeko: "MILK", mleko: "MILK",
  laktos: "MILK", lactose: "MILK",
  // Nötter
  notter: "NUTS", nuts: "NUTS", nusse: "NUTS", notter_tradnotter: "NUTS",
  "orasasti plodovi": "NUTS", orasi: "NUTS",
  // Selleri
  selleri: "CELERY", celery: "CELERY", sellerie: "CELERY", celer: "CELERY",
  // Senap
  senap: "MUSTARD", mustard: "MUSTARD", senf: "MUSTARD", senf_de: "MUSTARD", slacica: "MUSTARD",
  // Sesam
  sesam: "SESAME", sesame: "SESAME", susam: "SESAME",
  // Sulfiter
  sulfiter: "SULPHITES", sulphites: "SULPHITES", sulfite: "SULPHITES", sulfiti: "SULPHITES",
  // Lupin
  lupin: "LUPIN", lupine: "LUPIN",
  // Blötdjur
  blotdjur: "MOLLUSCS", molluscs: "MOLLUSCS", weichtiere: "MOLLUSCS", mekusci: "MOLLUSCS",
};

/** Tar bort diakriter så att "mlijeko" och "mliječko" hamnar på samma nyckel. */
function fold(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đ]/g, "d")
    .replace(/[ø]/g, "o")
    .replace(/\s+/g, " ");
}

/**
 * Tolkar en lista med allergener till koder.
 *
 * Redan giltiga koder släpps igenom. Okända värden faller bort — se
 * kommentaren vid SYNONYMS om varför en gissning är sämre än ett bortfall.
 */
export function parseAllergens(values: readonly string[]): Allergen[] {
  const found = new Set<Allergen>();

  for (const value of values) {
    const upper = value.trim().toUpperCase();
    if (isAllergen(upper)) {
      found.add(upper);
      continue;
    }

    const code = SYNONYMS[fold(value)];
    if (code) found.add(code);
  }

  // Ordningen är listans, inte inmatningens — två rätter med samma allergener
  // ska visa dem i samma ordning.
  return ALLERGENS.filter((allergen) => found.has(allergen));
}
