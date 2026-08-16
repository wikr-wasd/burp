/**
 * Fritextsökning i menyn.
 *
 * En meny på fyrtio rätter går inte att bläddra igenom vid ett bord. Sökrutan
 * är det som gör en lång meny användbar på en telefon — kategorinavigeringen
 * räcker bara så länge gästen vet vilken avdelning hen letar i.
 *
 * Modulen är ren och testad utan databas. Filtreringen körs i klienten på en
 * meny som redan är hämtad: en sökning som gick till servern hade kostat en
 * rundtur per tangenttryckning, på ett hotellwifi.
 */

/**
 * Tecken som `NFD` inte hjälper mot.
 *
 * Diakriter som ligger ovanpå en bokstav plockas bort av normaliseringen —
 * `ć` blir `c`. Men `đ` är en egen bokstav med ett streck genom stapeln, inte
 * ett `d` med accent, och överlever därför NFD orörd. Utan raden här hittar
 * "djuvec" inte "Đuveč", och det är ett av de vanligaste orden på menyerna vi
 * bygger för.
 */
const EGNA_BOKSTAVER: Record<string, string> = {
  đ: "d",
  ø: "o",
  ł: "l",
  ß: "ss",
  æ: "ae",
};

/**
 * Skriver om en text till den form jämförelsen sker i.
 *
 * Gästen skriver på det tangentbord telefonen råkar ha. En turist i Sarajevo
 * har sällan ć och č, och en svensk som söker "kottfars" ska hitta
 * "köttfärsbiff". Diakriterna faller därför bort på BÅDA sidor — det gör
 * sökningen trubbigare än en korrekt kollation, och det är avsikten: en träff
 * för mycket är ofarlig, en utebliven träff ser ut som att rätten inte finns.
 */
export function foldForSearch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[đøłßæ]/g, (character) => EGNA_BOKSTAVER[character] ?? character)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

/** Bara de fält sökningen läser. Vyn får ha hur många fler som helst. */
export interface SearchableItem {
  name: string;
  description: string | null;
}

export interface SearchableCategory<TItem extends SearchableItem> {
  name: string;
  description: string | null;
  items: TItem[];
}

/**
 * Menyn filtrerad på gästens sökord.
 *
 * Tom sökning ger menyn orörd. Kategorier utan träff faller bort helt — en
 * rubrik utan rätter under sig läser som att avdelningen är tom, inte som att
 * sökningen sorterade bort den.
 *
 * Flera ord måste alla förekomma, men behöver inte stå bredvid varandra:
 * "ćevapi 10" hittar "Ćevapi 10 kom", och "10 ćevapi" hittar den också.
 */
export function filterMenu<TItem extends SearchableItem, TCategory extends SearchableCategory<TItem>>(
  categories: readonly TCategory[],
  query: string,
): TCategory[] {
  const words = foldForSearch(query.trim()).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...categories];

  return categories
    .map((category) => {
      // Träff på avdelningen behåller hela avdelningen. Den som söker "pića"
      // vill se drycken, inte de rätter som råkar nämna dryck i beskrivningen.
      if (matchesAll(words, category.name, category.description)) return category;

      return {
        ...category,
        items: category.items.filter((item) => matchesAll(words, item.name, item.description)),
      };
    })
    .filter((category) => category.items.length > 0);
}

function matchesAll(words: readonly string[], ...fields: readonly (string | null)[]): boolean {
  const haystack = foldForSearch(fields.filter((field) => field !== null).join(" "));
  return words.every((word) => haystack.includes(word));
}
