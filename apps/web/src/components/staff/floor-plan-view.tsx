import type { FloorPlanSnapshot, TableSnapshot, TableState } from "@/lib/overview";

/**
 * Bordens läge, ritat i rummets form.
 *
 * Det här är hela nyttan med planritningen. Ett rutnät av bordsnummer säger
 * VILKET bord som ropar men inte VAR det står — och servitören som ska gå dit
 * tänker i rummet, inte i en lista. Med ritningen blir "bord 7 väntar" en punkt
 * man kan gå till.
 *
 * Serverkomponent med flit: ingenting här behöver interaktivitet, och
 * översikten laddas om av sig själv. En klientkomponent hade bara skickat
 * hundra rader JavaScript för att rita samma statiska SVG.
 *
 * Bord som inte är utplacerade visas inte här — de ligger kvar i rutnätet
 * bredvid. Att gissa en plats åt dem hade betytt att ritningen ljuger.
 */

const STATE_FILL: Record<TableState, string> = {
  LEDIGT: "fill-[var(--background)]",
  OPPEN_NOTA: "fill-gold-400/40",
  BESTALLNING: "fill-burp-600",
};

const STATE_TEXT: Record<TableState, string> = {
  LEDIGT: "fill-[var(--muted)]",
  OPPEN_NOTA: "fill-[var(--foreground)]",
  BESTALLNING: "fill-white",
};

const STATE_LABEL: Record<TableState, string> = {
  LEDIGT: "Ledigt",
  OPPEN_NOTA: "Öppen nota",
  BESTALLNING: "Beställning inne",
};

export function FloorPlanView({
  plan,
  tables,
}: {
  plan: FloorPlanSnapshot;
  tables: TableSnapshot[];
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
            <g key={table.id} transform={`rotate(${table.rotation} ${cx} ${cy})`}>
              {/* Titeln är det som gör ritningen läsbar för den som inte
                  skiljer färgerna åt. Färg ensam räcker aldrig. */}
              <title>
                {`Bord ${table.tableNumber}${table.zone ? ` · ${table.zone}` : ""} — ${STATE_LABEL[table.state]}`}
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
          );
        })}
      </svg>

      <figcaption className="label-caps mt-1.5">{plan.name}</figcaption>
    </figure>
  );
}
