import type { Dictionary } from "@/lib/i18n";
import { fill } from "@/lib/i18n";
import { ItemGlyph, PlanGrid, TableGlyph } from "@/components/staff/floor-plan-shapes";
import type { FloorItemSnapshot, FloorPlanSnapshot, TableSnapshot, TableState } from "@/lib/overview";

/**
 * Bordens läge, ritat i rummets form.
 *
 * Det här är hela nyttan med planritningen. Ett rutnät av bordsnummer säger
 * VILKET bord som ropar men inte VAR det står — och servitören som ska gå dit
 * tänker i rummet, inte i en lista. Med ritningen blir "bord 7 väntar" en punkt
 * man kan gå till.
 *
 * Serverkomponent med flit: varje bord är en LÄNK och ingen knapp, så
 * ingenting här behöver JavaScript. Översikten laddas om av sig själv, och en
 * klientkomponent hade bara skickat hundra rader skript för att rita samma
 * statiska SVG.
 *
 * Formerna — bord, stolar, bar, vägg — ritas av `floor-plan-shapes.tsx`, samma
 * modul som redigeraren använder. Rummet ska se likadant ut när man ritar det
 * som när man arbetar i det.
 *
 * Bord som inte är utplacerade visas inte här — de ligger kvar i rutnätet
 * bredvid. Att gissa en plats åt dem hade betytt att ritningen ljuger.
 */

/*
 * Grönt för SERVERAS, och samma gröna som köksskärmens ram runt en klar
 * biljett. Personalen rör sig mellan de två ytorna under ett pass, och samma
 * betydelse måste ha samma färg på båda — annars är färgen dekoration.
 */
const STATE_FILL: Record<TableState, string> = {
  LEDIGT: "fill-[var(--background)]",
  OPPEN_NOTA: "fill-gold-400/40",
  BESTALLNING: "fill-burp-600",
  SERVERAS: "fill-green-600",
};

const STATE_TEXT: Record<TableState, string> = {
  LEDIGT: "fill-[var(--muted)]",
  OPPEN_NOTA: "fill-[var(--foreground)]",
  BESTALLNING: "fill-white",
  SERVERAS: "fill-white",
};

/**
 * Bordets tillstånd, ur ordboken.
 *
 * Låg tidigare som en egen tabell här OCH en till i `dashboard/page.tsx`.
 * Två tabeller över samma fyra färgade rutor kunde säga olika saker om samma
 * bord, beroende på om man tittade på ritningen eller på rutnätet bredvid.
 */
export type TableStateLabels = Dictionary["staff"]["overview"];

export function FloorPlanView({
  plan,
  tables,
  items,
  labels,
  itemLabels,
  tableLabel,
}: {
  plan: FloorPlanSnapshot;
  tables: TableSnapshot[];
  /** Inredningen över alla ritningar — filtreras på den här. */
  items: FloorItemSnapshot[];
  /** Bordstillstånden ur ordboken. */
  labels: TableStateLabels;
  /** Inredningens sortnamn. Restaurangens egna etiketter översätts aldrig. */
  itemLabels: Dictionary["staff"]["floorItem"];
  /** Mallen "Bord {number}" ur det delade ordertypsavsnittet. */
  tableLabel: string;
}) {
  const placed = tables.filter(
    (table) => table.floorPlanId === plan.id && table.x !== null && table.y !== null,
  );

  const furniture = items.filter((item) => item.floorPlanId === plan.id);

  // Ett rum utan både bord och inredning är inget rum. Ritningen döljs hellre
  // än ritas tom — rutnätet bredvid visar borden ändå.
  if (placed.length === 0 && furniture.length === 0) return null;

  return (
    <figure className="mt-3">
      <svg
        viewBox={`0 0 ${plan.width} ${plan.height}`}
        role="img"
        aria-label={plan.name}
        className="w-full rounded-[0.5rem] border border-[var(--rule)] bg-[var(--surface)]"
        style={{ aspectRatio: `${plan.width} / ${plan.height}` }}
      >
        <PlanGrid id={plan.id} width={plan.width} height={plan.height} />

        {/* Inredningen under borden. Ett bord ska aldrig hamna bakom baren —
            det är bordet man arbetar med. */}
        {furniture.map((item) => (
          <ItemGlyph key={item.id} item={item} kindLabel={itemLabels[item.kind]} />
        ))}

        {placed.map((table) => (
          /*
           * Hela bordet är klickbart, inte bara siffran.
           *
           * `<a>` inuti SVG är riktig HTML och fungerar med tangentbord och
           * skärmläsare utan att vi bygger något eget. Träffytan blir hela
           * rutan — det är en ritning man pekar på med fingret, och en
           * bordsruta är mindre än en tumme på en surfplatta.
           */
          <a
            key={table.id}
            href={`/dashboard/bord/${table.id}`}
            className="cursor-pointer outline-none [&:focus-visible>*]:stroke-burp-600 [&:hover>*]:opacity-80"
          >
            {/* Titeln är det som gör ritningen läsbar för den som inte
                skiljer färgerna åt. Färg ensam räcker aldrig. */}
            <title>
              {`${fill(tableLabel, { number: table.tableNumber })}${
                table.zone ? ` · ${table.zone}` : ""
              } — ${labels[`state${table.state}`]}`}
            </title>

            <TableGlyph
              table={table}
              fillClass={STATE_FILL[table.state]}
              textClass={STATE_TEXT[table.state]}
            />
          </a>
        ))}
      </svg>

      <figcaption className="label-caps mt-1.5">{plan.name}</figcaption>
    </figure>
  );
}
