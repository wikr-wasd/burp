import type { Dictionary } from "@/lib/i18n";
import { fill } from "@/lib/i18n";
import type { FloorPlanSnapshot, TableSnapshot, TableState } from "@/lib/overview";

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
  labels,
  tableLabel,
}: {
  plan: FloorPlanSnapshot;
  tables: TableSnapshot[];
  /** Bordstillstånden ur ordboken. Rena strängar — komponenten är klientkod. */
  labels: TableStateLabels;
  /** Mallen "Bord {number}" ur det delade ordertypsavsnittet. */
  tableLabel: string;
}) {
  const placed = tables.filter(
    (table) => table.floorPlanId === plan.id && table.x !== null && table.y !== null,
  );

  if (placed.length === 0) return null;

  return (
    <figure className="mt-3">
      <svg
        viewBox={`0 0 ${plan.width} ${plan.height}`}
        role="img"
        aria-label={`Bordens läge i ${plan.name}`}
        className="w-full rounded-[0.5rem] border border-[var(--rule)] bg-[var(--surface)]"
        style={{ aspectRatio: `${plan.width} / ${plan.height}` }}
      >
        {placed.map((table) => {
          const x = table.x ?? 0;
          const y = table.y ?? 0;
          const cx = x + table.width / 2;
          const cy = y + table.height / 2;

          return (
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
            <g transform={`rotate(${table.rotation} ${cx} ${cy})`}>
              {/* Titeln är det som gör ritningen läsbar för den som inte
                  skiljer färgerna åt. Färg ensam räcker aldrig. */}
              <title>
                {`${fill(tableLabel, { number: table.tableNumber })}${
                  table.zone ? ` · ${table.zone}` : ""
                } — ${labels[`state${table.state}`]}`}
              </title>

              {table.shape === "ROUND" ? (
                <ellipse
                  cx={cx}
                  cy={cy}
                  rx={table.width / 2}
                  ry={table.height / 2}
                  className={STATE_FILL[table.state]}
                  stroke="currentColor"
                  strokeWidth="0.1"
                />
              ) : (
                <rect
                  x={x}
                  y={y}
                  width={table.width}
                  height={table.height}
                  rx={0.4}
                  className={STATE_FILL[table.state]}
                  stroke="currentColor"
                  strokeWidth="0.1"
                />
              )}

              <text
                x={cx}
                y={cy}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={Math.min(table.width, table.height) * 0.45}
                className={`${STATE_TEXT[table.state]} font-semibold`}
              >
                {table.tableNumber}
              </text>
            </g>
            </a>
          );
        })}
      </svg>

      <figcaption className="label-caps mt-1.5">{plan.name}</figcaption>
    </figure>
  );
}
