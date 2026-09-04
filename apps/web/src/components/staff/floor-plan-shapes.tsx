import { seatPositions, type FloorItemKind, type TableShape } from "@burp/core";

/**
 * Rummets byggstenar, ritade EN gång.
 *
 * Ritningen finns på två ytor: översikten läser den (serverkomponent, inga
 * skript) och bordssidan ritar om den (klientkomponent, pointer events). De
 * ska visa exakt samma rum — ett bord som ser ut på ett sätt när man ritar det
 * och på ett annat under passet är inte samma bord.
 *
 * Färgtabellerna över bordens fyra tillstånd låg redan som två kopior en gång,
 * en i översikten och en i planritningen, och kunde säga olika saker om samma
 * färgade ruta. Formerna får inte göra om den resan. Därför bor de här, och
 * båda ytorna importerar dem.
 *
 * Serverkomponenter med flit: ingenting här har state eller handlers. Den som
 * behöver interaktion lägger den utanpå — en `<a>` i översikten, en
 * pekarhanterare i redigeraren.
 */

export interface PlanTable {
  id: string;
  tableNumber: string;
  capacity: number | null;
  x: number | null;
  y: number | null;
  width: number;
  height: number;
  rotation: number;
  shape: TableShape;
}

export interface PlanItem {
  id: string;
  kind: FloorItemKind;
  label: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

/**
 * Rutnätet.
 *
 * Mönstrets id måste vara unikt per sida: översikten ritar en ritning per
 * våning, och två `<pattern id="grid">` i samma dokument gör att den andra
 * ritningen hämtar den förstas mönster.
 */
export function PlanGrid({
  id,
  width,
  height,
}: {
  id: string;
  width: number;
  height: number;
}) {
  return (
    <>
      <defs>
        <pattern id={`grid-${id}`} width="1" height="1" patternUnits="userSpaceOnUse">
          <path
            d="M 1 0 L 0 0 0 1"
            fill="none"
            stroke="currentColor"
            strokeWidth="0.02"
            className="text-[var(--rule)]"
          />
        </pattern>
      </defs>
      <rect width={width} height={height} fill={`url(#grid-${id})`} />
    </>
  );
}

/**
 * Ett bord med sina stolar.
 *
 * Stolarna räknas ur `capacity` — se `seatPositions()` i @burp/core och
 * kommentaren i migration 0072 om varför de inte lagras. De roteras
 * TILLSAMMANS med bordet i samma `<g>`: en stol som roterats för sig hade
 * legat kvar när bordet vändes.
 *
 * Stolarna ritas dämpade och bordet i sitt tillståndsfärg. Det är bordet som
 * bär betydelsen — stolarna finns för att den som ritar ska känna igen sitt
 * eget rum.
 */
export function TableGlyph({
  table,
  fillClass,
  textClass,
  strokeClass = "text-[var(--foreground)]",
}: {
  table: PlanTable;
  /** Bordets fyllning. Tillståndsfärg i översikten, markering i redigeraren. */
  fillClass: string;
  textClass: string;
  strokeClass?: string;
}) {
  const x = table.x ?? 0;
  const y = table.y ?? 0;
  const cx = x + table.width / 2;
  const cy = y + table.height / 2;

  const seats = seatPositions(
    { x, y, width: table.width, height: table.height, shape: table.shape },
    table.capacity,
  );

  return (
    <g transform={`rotate(${table.rotation} ${cx} ${cy})`} className={strokeClass}>
      {seats.map((seat, index) => (
        <circle
          key={index}
          cx={seat.x}
          cy={seat.y}
          r={seat.r}
          className="fill-[var(--rule)] opacity-70"
        />
      ))}

      {table.shape === "ROUND" ? (
        <ellipse
          cx={cx}
          cy={cy}
          rx={table.width / 2}
          ry={table.height / 2}
          className={fillClass}
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
          className={fillClass}
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
        className={`${textClass} font-semibold`}
        style={{ pointerEvents: "none" }}
      >
        {table.tableNumber}
      </text>
    </g>
  );
}

/**
 * Inredningen: baren, väggen, dörren, trappan, växten.
 *
 * Allt ritas dämpat. Rummet ska kännas igen, men det är bordens fyra färger
 * som bär arbetet — en bar i rött hade konkurrerat med det bord som ropar.
 *
 * Etiketten är restaurangens egen text och översätts aldrig. Sorten har ett
 * översatt namn, men det skrivs bara ut i de tre rutor som är RUM och inte
 * väggar: baren, köket, toaletten. En ritning full av ordet "Fönster" är
 * svårare att läsa än ett fönster. För resten ligger namnet i `<title>`, där
 * skärmläsaren och den som pekar hittar det.
 */
const NAMED_IN_PLAN: readonly FloorItemKind[] = ["BAR", "WC", "KITCHEN"];

export function ItemGlyph({ item, kindLabel }: { item: PlanItem; kindLabel: string }) {
  const { x, y, width, height } = item;
  const cx = x + width / 2;
  const cy = y + height / 2;

  const caption =
    item.kind === "TEXT"
      ? null
      : (item.label ?? (NAMED_IN_PLAN.includes(item.kind) ? kindLabel : null));

  return (
    <g
      transform={`rotate(${item.rotation} ${cx} ${cy})`}
      className="text-[var(--muted)]"
    >
      <title>{item.label ? `${kindLabel} — ${item.label}` : kindLabel}</title>
      {shapeFor(item, cx, cy)}

      {caption ? (
        <text
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={Math.min(Math.min(width, height) * 0.4, 1.4)}
          className="fill-[var(--muted)]"
          style={{ pointerEvents: "none" }}
        >
          {caption}
        </text>
      ) : null}
    </g>
  );
}

function shapeFor(item: PlanItem, cx: number, cy: number) {
  const { x, y, width, height } = item;

  switch (item.kind) {
    /* Väggen är massiv. Den är det enda man inte kan gå igenom. */
    case "WALL":
      return <rect x={x} y={y} width={width} height={height} className="fill-[var(--rule)]" />;

    /*
     * Dörren ritas som ett hål i väggen med sitt uppslag. Bågen är det som gör
     * att den läses som en dörr och inte som ett fönster.
     */
    case "DOOR":
      return (
        <>
          <rect x={x} y={y} width={width} height={height} className="fill-[var(--surface)]" />
          <path
            d={`M ${x} ${y + height} A ${width} ${width} 0 0 1 ${x + width} ${y + height}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="0.12"
          />
        </>
      );

    case "WINDOW":
      return (
        <>
          <rect x={x} y={y} width={width} height={height} className="fill-[var(--rule)]" />
          <line
            x1={x}
            y1={cy}
            x2={x + width}
            y2={cy}
            stroke="currentColor"
            strokeWidth="0.14"
            className="text-[var(--surface)]"
          />
        </>
      );

    /* Trappan: stegen gör riktningen läsbar utan ett ord. */
    case "STAIRS": {
      const steps = Math.max(2, Math.round(height));
      return (
        <>
          <rect
            x={x}
            y={y}
            width={width}
            height={height}
            className="fill-[var(--background)]"
            stroke="currentColor"
            strokeWidth="0.08"
          />
          {Array.from({ length: steps - 1 }, (_, index) => {
            const stepY = y + ((index + 1) * height) / steps;
            return (
              <line
                key={index}
                x1={x}
                y1={stepY}
                x2={x + width}
                y2={stepY}
                stroke="currentColor"
                strokeWidth="0.06"
              />
            );
          })}
        </>
      );
    }

    /* Växten avgränsar en uteservering som inte har någon vägg. */
    case "PLANT":
      return (
        <circle
          cx={cx}
          cy={cy}
          r={Math.min(width, height) / 2}
          className="fill-green-600/25"
          stroke="currentColor"
          strokeWidth="0.08"
        />
      );

    /* Bara text — en egen etikett över en del av rummet: "Bašta". */
    case "TEXT":
      return (
        <text
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={Math.min(height * 0.7, 2.4)}
          className="fill-[var(--muted)] font-semibold tracking-wide uppercase"
          style={{ pointerEvents: "none" }}
        >
          {item.label}
        </text>
      );

    /* Bar, kök och toalett: en yta med kant. Etiketten står i mitten. */
    default:
      return (
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          rx={0.3}
          className="fill-[var(--background)]"
          stroke="currentColor"
          strokeWidth="0.1"
          strokeDasharray={item.kind === "KITCHEN" ? "0.6 0.4" : undefined}
        />
      );
  }
}
