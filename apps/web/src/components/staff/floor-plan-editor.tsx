"use client";

import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import {
  AppWindow,
  Bath,
  ChefHat,
  DoorOpen,
  Footprints,
  LayoutGrid,
  Minus,
  Plus,
  RotateCw,
  Save,
  Sprout,
  Trash2,
  Type,
  Undo2,
  Wine,
} from "lucide-react";
import {
  clampToPlan,
  FLOOR_ITEM_KINDS,
  FLOOR_ITEM_SIZE,
  type FloorItemKind,
  type TableShape,
} from "@burp/core";
import {
  createFloorPlan,
  deleteFloorPlan,
  renameFloorPlan,
  saveFloorPlanLayout,
  type PlanItemInput,
  type TablePosition,
} from "@/app/dashboard/bord/actions";
import { EmptyState } from "@/components/ui/empty-state";
import { ItemGlyph, PlanGrid, TableGlyph } from "@/components/staff/floor-plan-shapes";
import { fill, type Dictionary } from "@/lib/i18n";

/**
 * Planritningen — rummet som restaurangen ritar själv.
 *
 * Redigeraren är den svåra delen, och den svåraste delen av den är att det ska
 * fungera med fingrar. Därför **pointer events** och inte mouse events: samma
 * kod hanterar mus, penna och finger, och en surfplatta i en restaurang är det
 * mest sannolika stället någon möblerar om.
 *
 * Koordinaterna är i rutnätsenheter. Ritytan skalas till skärmen med en
 * viewBox — hade positionerna varit i pixlar hade rummet ritats om varje gång
 * någon bytte enhet.
 *
 * SVG och inte absolut positionerade divar, av samma skäl: en viewBox gör
 * skalningen till en egenskap hos ritytan i stället för till en uträkning som
 * måste göras om vid varje omrendering. Det är också skälet att ingenting här
 * är jQuery: React äger redan DOM:en, och ett bibliotek som flyttar noder bakom
 * ryggen på den ger två sanningar om var ett bord står. Draget nedan är
 * trettio rader egen kod och fungerar med finger, penna, mus och tangentbord.
 *
 * Allt utom Spara är lokalt. Den som möblerar om ett rum provar sig fram, och
 * varje flytt får inte vara ett anrop — därför en ångra-stack här och ETT
 * anrop när det är klart. Servern skriver hela rummet i en transaktion
 * (`save_floor_plan_layout`, migration 0072): ett avbrott mitt i får inte
 * lämna borden flyttade men baren kvar där den stod.
 */

export interface FloorPlanView {
  id: string;
  name: string;
  width: number;
  height: number;
}

export interface EditorTable {
  id: string;
  tableNumber: string;
  zone: string | null;
  capacity: number | null;
  floorPlanId: string | null;
  x: number | null;
  y: number | null;
  rotation: number;
  shape: TableShape;
  width: number;
  height: number;
}

export interface EditorItem {
  id: string;
  floorPlanId: string;
  kind: FloorItemKind;
  label: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

type Selection = { type: "table" | "item"; id: string } | null;

type PlanSizes = Record<string, { width: number; height: number }>;

/** Rutnätets steg. Bord fäster mot heltal, vilket räcker för ett rum. */
const SNAP = 1;

/** Ikon per sort. Paletten ska gå att läsa i förbifarten. */
const ITEM_ICON: Record<FloorItemKind, typeof Wine> = {
  BAR: Wine,
  WALL: Minus,
  DOOR: DoorOpen,
  WINDOW: AppWindow,
  PLANT: Sprout,
  STAIRS: Footprints,
  WC: Bath,
  KITCHEN: ChefHat,
  TEXT: Type,
};

const SHAPES: TableShape[] = ["ROUND", "SQUARE", "RECT"];

export function FloorPlanEditor({
  plans,
  tables,
  items,
  labels,
  itemLabels,
}: {
  plans: FloorPlanView[];
  tables: EditorTable[];
  items: EditorItem[];
  /** Bordsytans texter ur ordboken. Rena strängar — komponenten är klientkod. */
  labels: Dictionary["staff"]["tables"];
  /** Inredningens sortnamn. Restaurangens egna etiketter översätts aldrig. */
  itemLabels: Dictionary["staff"]["floorItem"];
}) {
  const [activePlanId, setActivePlanId] = useState(plans[0]?.id ?? null);
  const [layout, setLayout] = useState<EditorTable[]>(tables);
  const [furniture, setFurniture] = useState<EditorItem[]>(items);
  const [sizes, setSizes] = useState<PlanSizes>(() => initialSizes(plans));

  /** Varje ändring lägger en kopia här. Ångra är att plocka den senaste. */
  const [history, setHistory] = useState<{ tables: EditorTable[]; items: EditorItem[]; sizes: PlanSizes }[]>([]);
  const [selected, setSelected] = useState<Selection>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [newPlanName, setNewPlanName] = useState("");
  const [pending, startTransition] = useTransition();

  const plan = useMemo(() => {
    const found = plans.find((candidate) => candidate.id === activePlanId);
    if (!found) return null;
    const size = sizes[found.id] ?? { width: found.width, height: found.height };
    return { ...found, ...size };
  }, [plans, activePlanId, sizes]);

  const placed = useMemo(
    () => layout.filter((table) => table.floorPlanId === activePlanId && table.x !== null),
    [layout, activePlanId],
  );

  const onPlan = useMemo(
    () => furniture.filter((item) => item.floorPlanId === activePlanId),
    [furniture, activePlanId],
  );

  const unplaced = useMemo(() => layout.filter((table) => table.floorPlanId === null), [layout]);

  const dirty = useMemo(
    () =>
      JSON.stringify({ layout, furniture, sizes }) !==
      JSON.stringify({ layout: tables, furniture: items, sizes: initialSizes(plans) }),
    [layout, furniture, sizes, tables, items, plans],
  );

  const selectedTable =
    selected?.type === "table" ? (layout.find((t) => t.id === selected.id) ?? null) : null;
  const selectedItem =
    selected?.type === "item" ? (furniture.find((i) => i.id === selected.id) ?? null) : null;

  /** Sparar nuvarande läge innan en ändring, så att Ångra har något att gå till. */
  const remember = useCallback(() => {
    setHistory((current) => [...current.slice(-49), { tables: layout, items: furniture, sizes }]);
    setFeedback(null);
  }, [layout, furniture, sizes]);

  function updateTable(id: string, patch: Partial<EditorTable>) {
    setLayout((current) => current.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  function updateItem(id: string, patch: Partial<EditorItem>) {
    setFurniture((current) => current.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  function undo() {
    setHistory((current) => {
      const previous = current[current.length - 1];
      if (previous) {
        setLayout(previous.tables);
        setFurniture(previous.items);
        setSizes(previous.sizes);
      }
      return current.slice(0, -1);
    });
  }

  /** Flyttar det valda, oavsett om det är ett bord eller en sak. */
  function move(type: "table" | "item", id: string, x: number, y: number) {
    if (type === "table") updateTable(id, { x, y });
    else updateItem(id, { x, y });
  }

  function addItem(kind: FloorItemKind) {
    if (!plan) return;
    remember();

    const size = FLOOR_ITEM_SIZE[kind];
    const at = clampToPlan(
      {
        x: Math.round(plan.width / 2 - size.width / 2),
        y: Math.round(plan.height / 2 - size.height / 2),
        ...size,
      },
      plan,
    );

    const item: EditorItem = {
      id: crypto.randomUUID(),
      floorPlanId: plan.id,
      kind,
      // En etikett utan text är en tom ruta mitt i rummet — därför får TEXT
      // sitt sortnamn som utgångsvärde och skrivs över direkt i fältet.
      label: kind === "TEXT" ? itemLabels.TEXT : null,
      rotation: 0,
      ...size,
      ...at,
    };

    setFurniture((current) => [...current, item]);
    setSelected({ type: "item", id: item.id });
  }

  function resize(delta: { width?: number; height?: number }) {
    if (!plan) return;
    remember();

    if (selectedTable) {
      const width = clamp((selectedTable.width ?? 4) + (delta.width ?? 0), 1, 40);
      const height = clamp((selectedTable.height ?? 4) + (delta.height ?? 0), 1, 40);
      const at = clampToPlan({ x: selectedTable.x ?? 0, y: selectedTable.y ?? 0, width, height }, plan);
      updateTable(selectedTable.id, { width, height, ...at });
      return;
    }

    if (selectedItem) {
      const width = clamp(selectedItem.width + (delta.width ?? 0), 1, plan.width);
      const height = clamp(selectedItem.height + (delta.height ?? 0), 1, plan.height);
      const at = clampToPlan({ x: selectedItem.x, y: selectedItem.y, width, height }, plan);
      updateItem(selectedItem.id, { width, height, ...at });
    }
  }

  function rotate() {
    if (!selected) return;
    remember();

    if (selectedTable) {
      updateTable(selectedTable.id, { rotation: (selectedTable.rotation + 45) % 360 });
    } else if (selectedItem) {
      updateItem(selectedItem.id, { rotation: (selectedItem.rotation + 45) % 360 });
    }
  }

  function removeSelected() {
    if (!selected) return;
    remember();

    if (selectedTable) {
      // Bordet raderas ALDRIG här. Det är en beställningspunkt med historik
      // och hamnar bland de outplacerade, redo att sättas ut igen.
      updateTable(selectedTable.id, { floorPlanId: null, x: null, y: null });
    } else if (selectedItem) {
      setFurniture((current) => current.filter((item) => item.id !== selectedItem.id));
    }

    setSelected(null);
  }

  function save() {
    if (!plan) return;

    const positions: TablePosition[] = layout
      // Bara bord som hör till den här ritningen eller som just lyfts av den.
      .filter((table) => table.floorPlanId === plan.id || table.floorPlanId === null)
      .map((table) => ({
        id: table.id,
        placed: table.floorPlanId === plan.id && table.x !== null && table.y !== null,
        x: table.x ?? 0,
        y: table.y ?? 0,
        rotation: table.rotation,
        shape: table.shape,
        width: table.width,
        height: table.height,
        capacity: table.capacity,
      }));

    const planItems: PlanItemInput[] = onPlan.map((item) => ({
      id: item.id,
      kind: item.kind,
      label: item.label,
      x: item.x,
      y: item.y,
      width: item.width,
      height: item.height,
      rotation: item.rotation,
    }));

    startTransition(async () => {
      const result = await saveFloorPlanLayout(plan.id, {
        tables: positions,
        items: planItems,
        width: plan.width,
        height: plan.height,
      });

      setFeedback({
        ok: result.ok,
        message: result.ok ? labels.planSaved : (result.message ?? labels.somethingWrong),
      });
      if (result.ok) setHistory([]);
    });
  }

  if (plans.length === 0) {
    return (
      <div className="mt-8">
        <EmptyState icon={LayoutGrid} title={labels.planEmptyTitle} body={labels.planEmptyBody} />
        <NewPlan
          labels={labels}
          value={newPlanName}
          onChange={setNewPlanName}
          onCreate={() => {
            startTransition(async () => {
              const result = await createFloorPlan(newPlanName);
              if (result.ok) setNewPlanName("");
              else setFeedback({ ok: false, message: result.message ?? labels.somethingWrong });
            });
          }}
          pending={pending}
        />
        {feedback ? (
          <p role="alert" className="mt-3 text-sm text-burp-700 dark:text-burp-300">
            {feedback.message}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-center gap-2">
        {plans.map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            aria-pressed={candidate.id === activePlanId}
            onClick={() => {
              setActivePlanId(candidate.id);
              setSelected(null);
            }}
            className={`min-h-11 rounded-lg border px-3 text-sm font-medium transition-colors ${
              candidate.id === activePlanId
                ? "border-burp-600 bg-burp-600 text-white"
                : "border-[var(--rule)] hover:border-burp-600"
            }`}
          >
            {candidate.name}
          </button>
        ))}
      </div>

      {plan ? (
        <>
          {/* Paletten. Klick lägger saken mitt i rummet — den som just lagt ut
              en bar vill dra den dit den ska, inte leta efter den i ett hörn. */}
          <section className="mt-4">
            <h3 className="label-caps">{labels.addFurniture}</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {FLOOR_ITEM_KINDS.map((kind) => {
                const Icon = ITEM_ICON[kind];
                return (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => addItem(kind)}
                    className="btn btn-secondary"
                  >
                    <Icon size={16} aria-hidden="true" />
                    {itemLabels[kind]}
                  </button>
                );
              })}
            </div>
          </section>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={undo}
              disabled={history.length === 0}
              className="btn btn-secondary"
            >
              <Undo2 size={16} aria-hidden="true" />
              {labels.undo}
            </button>

            <button type="button" onClick={rotate} disabled={!selected} className="btn btn-secondary">
              <RotateCw size={16} aria-hidden="true" />
              {labels.rotate}
            </button>

            <button
              type="button"
              onClick={removeSelected}
              disabled={!selected}
              className="btn btn-secondary"
            >
              <Trash2 size={16} aria-hidden="true" />
              {selectedItem ? labels.removeItem : labels.removeFromPlan}
            </button>

            <span className="mr-auto" />

            <button
              type="button"
              onClick={save}
              disabled={!dirty || pending}
              className="btn btn-primary"
            >
              <Save size={16} aria-hidden="true" />
              {pending ? labels.saving : labels.save}
            </button>
          </div>

          {feedback ? (
            <p
              role="status"
              className={`mt-3 text-sm ${feedback.ok ? "text-green-700 dark:text-green-400" : "text-burp-700 dark:text-burp-300"}`}
            >
              {feedback.message}
            </p>
          ) : null}

          <Canvas
            plan={plan}
            tables={placed}
            items={onPlan}
            itemLabels={itemLabels}
            selected={selected}
            onSelect={setSelected}
            onBeforeMove={remember}
            onMove={move}
            emptyLabel={labels.planCanvasEmpty}
          />

          {/* Det valda, och vad som går att göra med det. Panelen står under
              ritningen och inte bredvid: på en surfplatta i liggande läge är
              ritytan bred, och en kolumn vid sidan hade tryckt ihop rummet. */}
          {selectedTable ? (
            <TablePanel
              table={selectedTable}
              labels={labels}
              onShape={(shape) => {
                remember();
                updateTable(selectedTable.id, { shape });
              }}
              onSeats={(delta) => {
                remember();
                const next = clamp((selectedTable.capacity ?? 0) + delta, 0, 100);
                updateTable(selectedTable.id, { capacity: next === 0 ? null : next });
              }}
              onResize={resize}
            />
          ) : selectedItem ? (
            <ItemPanel
              item={selectedItem}
              labels={labels}
              itemLabels={itemLabels}
              onLabel={(label) => updateItem(selectedItem.id, { label: label || null })}
              onResize={resize}
            />
          ) : (
            <p className="mt-3 text-sm text-[var(--muted)]">{labels.selectHint}</p>
          )}

          {/* Bord som inte är utplacerade. De skapades innan ritningen fanns,
              eller lades till mitt i ett pass — båda är normala, och listan
              är vägen in på ritningen. */}
          <section className="mt-6">
            <h3 className="label-caps">{labels.notPlaced}</h3>
            {unplaced.length === 0 ? (
              <p className="mt-2 text-sm text-[var(--muted)]">{labels.allPlaced}</p>
            ) : (
              <ul className="mt-2 flex flex-wrap gap-2">
                {unplaced.map((table) => (
                  <li key={table.id}>
                    <button
                      type="button"
                      onClick={() => {
                        remember();
                        // Mitt i rummet. Den som just lagt ut ett bord vill
                        // flytta det, inte leta efter det i ett hörn.
                        updateTable(table.id, {
                          floorPlanId: plan.id,
                          x: Math.round(plan.width / 2),
                          y: Math.round(plan.height / 2),
                        });
                        setSelected({ type: "table", id: table.id });
                      }}
                      className="btn btn-secondary"
                    >
                      <Plus size={14} aria-hidden="true" />
                      {table.tableNumber}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <details className="mt-8">
            <summary className="cursor-pointer text-sm text-[var(--muted)]">
              {labels.managePlans}
            </summary>

            <div className="mt-3 card p-4">
              {/* Rummets storlek. En uteservering är sällan lika stor som
                  salen, och ett rum som inte går att ändra tvingar den som
                  ritar att krympa möblerna i stället. */}
              <h4 className="label-caps">{labels.planSize}</h4>
              <div className="mt-2 flex flex-wrap items-center gap-4">
                <Stepper
                  label={labels.widthLabel}
                  value={plan.width}
                  onChange={(delta) => {
                    remember();
                    setSizes((current) => ({
                      ...current,
                      [plan.id]: {
                        width: clamp(plan.width + delta, 10, 200),
                        height: plan.height,
                      },
                    }));
                  }}
                />
                <Stepper
                  label={labels.heightLabel}
                  value={plan.height}
                  onChange={(delta) => {
                    remember();
                    setSizes((current) => ({
                      ...current,
                      [plan.id]: {
                        width: plan.width,
                        height: clamp(plan.height + delta, 10, 200),
                      },
                    }));
                  }}
                />
              </div>
              <p className="mt-2 text-xs text-[var(--muted)]">{labels.planSizeHint}</p>

              <div className="mt-5 border-t border-[var(--rule)] pt-4">
                <RenamePlan plan={plan} labels={labels} onFeedback={setFeedback} />
              </div>

              <div className="mt-5 border-t border-[var(--rule)] pt-4">
                <NewPlan
                  value={newPlanName}
                  onChange={setNewPlanName}
                  onCreate={() => {
                    startTransition(async () => {
                      const result = await createFloorPlan(newPlanName);
                      if (result.ok) setNewPlanName("");
                      else
                        setFeedback({ ok: false, message: result.message ?? labels.somethingWrong });
                    });
                  }}
                  pending={pending}
                  labels={labels}
                />
              </div>

              <button
                type="button"
                onClick={() => {
                  if (!window.confirm(fill(labels.planDeleteConfirm, { name: plan.name }))) return;
                  startTransition(async () => {
                    const result = await deleteFloorPlan(plan.id);
                    if (!result.ok) {
                      setFeedback({ ok: false, message: result.message ?? labels.somethingWrong });
                    }
                  });
                }}
                className="btn btn-secondary mt-5"
              >
                <Trash2 size={16} aria-hidden="true" />
                {labels.planDelete}
              </button>
            </div>
          </details>
        </>
      ) : null}
    </div>
  );
}

/* ── Ritytan ─────────────────────────────────────────────────────────────── */

function Canvas({
  plan,
  tables,
  items,
  itemLabels,
  selected,
  onSelect,
  onBeforeMove,
  onMove,
  emptyLabel,
}: {
  plan: FloorPlanView;
  tables: EditorTable[];
  items: EditorItem[];
  itemLabels: Dictionary["staff"]["floorItem"];
  selected: Selection;
  onSelect: (selection: Selection) => void;
  onBeforeMove: () => void;
  onMove: (type: "table" | "item", id: string, x: number, y: number) => void;
  emptyLabel: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef<{
    type: "table" | "item";
    id: string;
    width: number;
    height: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  /**
   * Skärmkoordinat till rutnätskoordinat.
   *
   * `getScreenCTM().inverse()` gör jobbet oavsett hur ritytan skalats, zoomats
   * eller scrollats. Att räkna själv ur `getBoundingClientRect` fungerar tills
   * någon zoomar sidan.
   */
  function toGrid(event: React.PointerEvent): { x: number; y: number } | null {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return null;

    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;

    const local = point.matrixTransform(ctm.inverse());
    return { x: local.x, y: local.y };
  }

  function startDrag(
    event: React.PointerEvent,
    type: "table" | "item",
    thing: { id: string; x: number | null; y: number | null; width: number; height: number },
  ) {
    const point = toGrid(event);
    if (!point) return;

    onSelect({ type, id: thing.id });
    onBeforeMove();

    // Fångar pekaren så att draget fortsätter även när fingret glider utanför
    // saken — utan det tappas draget så fort man rör sig snabbt.
    (event.target as Element).setPointerCapture(event.pointerId);

    dragging.current = {
      type,
      id: thing.id,
      width: thing.width,
      height: thing.height,
      offsetX: point.x - (thing.x ?? 0),
      offsetY: point.y - (thing.y ?? 0),
    };
  }

  function onPointerMove(event: React.PointerEvent) {
    const drag = dragging.current;
    if (!drag) return;

    const point = toGrid(event);
    if (!point) return;

    // Fäster mot rutnätet och håller saken innanför rummet. Samma uträkning
    // som servern gör — `clampToPlan` ligger i @burp/core just därför.
    const at = clampToPlan(
      {
        x: Math.round((point.x - drag.offsetX) / SNAP) * SNAP,
        y: Math.round((point.y - drag.offsetY) / SNAP) * SNAP,
        width: drag.width,
        height: drag.height,
      },
      plan,
    );

    onMove(drag.type, drag.id, at.x, at.y);
  }

  function endDrag() {
    dragging.current = null;
  }

  return (
    <div className="mt-4 overflow-x-auto">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${plan.width} ${plan.height}`}
        role="application"
        aria-label={plan.name}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerDown={(event) => {
          // Klick på tomma golvet avmarkerar. Utan det står panelen kvar och
          // pekar på ett bord man redan slutat titta på.
          if (event.target === svgRef.current) onSelect(null);
        }}
        // `touch-none` stänger av webbläsarens egen panorering. Utan den
        // scrollar sidan i stället för att bordet flyttas.
        className="min-w-[40rem] touch-none rounded-lg border border-[var(--rule)] bg-[var(--surface)]"
        style={{ aspectRatio: `${plan.width} / ${plan.height}` }}
      >
        <PlanGrid id={plan.id} width={plan.width} height={plan.height} />

        {/* Inredningen först, alltså under borden. Ett bord som hamnar på
            baren ska synas ovanpå den — det är bordet man arbetar med. */}
        {items.map((item) => {
          const isSelected = selected?.type === "item" && selected.id === item.id;
          return (
            <g
              key={item.id}
              onPointerDown={(event) => startDrag(event, "item", item)}
              className="cursor-grab"
            >
              <ItemGlyph item={item} kindLabel={itemLabels[item.kind]} />
              {isSelected ? <SelectionRing box={item} /> : null}
            </g>
          );
        })}

        {tables.map((table) => {
          const isSelected = selected?.type === "table" && selected.id === table.id;
          return (
            <g
              key={table.id}
              onPointerDown={(event) => startDrag(event, "table", table)}
              className="cursor-grab"
            >
              <TableGlyph
                table={table}
                fillClass={isSelected ? "fill-burp-600" : "fill-[var(--background)]"}
                textClass={isSelected ? "fill-white" : "fill-[var(--foreground)]"}
              />
              {isSelected ? (
                <SelectionRing
                  box={{ x: table.x ?? 0, y: table.y ?? 0, width: table.width, height: table.height }}
                />
              ) : null}
            </g>
          );
        })}

        {tables.length === 0 && items.length === 0 ? (
          <text
            x={plan.width / 2}
            y={plan.height / 2}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={Math.min(plan.width, plan.height) * 0.06}
            className="fill-[var(--muted)]"
          >
            {emptyLabel}
          </text>
        ) : null}
      </svg>
    </div>
  );
}

/** Markeringen. En prickad ram utanpå det valda, i handlingsrött. */
function SelectionRing({
  box,
}: {
  box: { x: number; y: number; width: number; height: number };
}) {
  return (
    <rect
      x={box.x - 0.4}
      y={box.y - 0.4}
      width={box.width + 0.8}
      height={box.height + 0.8}
      rx={0.4}
      fill="none"
      strokeWidth="0.14"
      strokeDasharray="0.5 0.4"
      className="stroke-burp-600"
      style={{ pointerEvents: "none" }}
    />
  );
}

/* ── Panelerna under ritningen ───────────────────────────────────────────── */

function TablePanel({
  table,
  labels,
  onShape,
  onSeats,
  onResize,
}: {
  table: EditorTable;
  labels: Dictionary["staff"]["tables"];
  onShape: (shape: TableShape) => void;
  onSeats: (delta: number) => void;
  onResize: (delta: { width?: number; height?: number }) => void;
}) {
  return (
    <section className="card mt-4 p-4">
      <h3 className="font-display text-lg">{table.tableNumber}</h3>

      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-4">
        <div>
          <span className="label-caps">{labels.shape}</span>
          <div className="mt-1.5 flex gap-2">
            {SHAPES.map((shape) => (
              <button
                key={shape}
                type="button"
                aria-pressed={table.shape === shape}
                onClick={() => onShape(shape)}
                className={`min-h-11 rounded-lg border px-3 text-sm transition-colors ${
                  table.shape === shape
                    ? "border-burp-600 bg-burp-600 text-white"
                    : "border-[var(--rule)] hover:border-burp-600"
                }`}
              >
                {labels[`shape${shape}`]}
              </button>
            ))}
          </div>
        </div>

        {/* Platsantalet ritar stolarna. Det är samma `capacity` som bokningen
            läser — en sexa i rummet är en sexa att boka. */}
        <Stepper
          label={labels.seats}
          value={table.capacity ?? 0}
          onChange={onSeats}
        />

        <Stepper label={labels.widthLabel} value={table.width} onChange={(d) => onResize({ width: d })} />
        <Stepper label={labels.heightLabel} value={table.height} onChange={(d) => onResize({ height: d })} />
      </div>
    </section>
  );
}

function ItemPanel({
  item,
  labels,
  itemLabels,
  onLabel,
  onResize,
}: {
  item: EditorItem;
  labels: Dictionary["staff"]["tables"];
  itemLabels: Dictionary["staff"]["floorItem"];
  onLabel: (label: string) => void;
  onResize: (delta: { width?: number; height?: number }) => void;
}) {
  return (
    <section className="card mt-4 p-4">
      <h3 className="font-display text-lg">{itemLabels[item.kind]}</h3>

      <div className="mt-3 flex flex-wrap items-end gap-x-6 gap-y-4">
        <label className="min-w-52 flex-1">
          <span className="label-caps">{labels.itemLabel}</span>
          <input
            type="text"
            value={item.label ?? ""}
            maxLength={40}
            onChange={(event) => onLabel(event.target.value)}
            placeholder={labels.itemLabelPlaceholder}
            className="field mt-1.5"
          />
        </label>

        <Stepper label={labels.widthLabel} value={item.width} onChange={(d) => onResize({ width: d })} />
        <Stepper label={labels.heightLabel} value={item.height} onChange={(d) => onResize({ height: d })} />
      </div>

      <p className="mt-3 text-xs text-[var(--muted)]">{labels.itemLabelHint}</p>
    </section>
  );
}

/**
 * Plus och minus, inte ett dragreglage.
 *
 * Ett handtag i hörnet är finare att titta på och sämre att använda: på en
 * surfplatta täcker fingret precis det man siktar på. Två knappar med elva
 * millimeters träffyta träffar rätt varje gång, och fungerar dessutom med
 * tangentbord utan att vi bygger något eget.
 */
function Stepper({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (delta: number) => void;
}) {
  return (
    <div>
      <span className="label-caps">{label}</span>
      <div className="mt-1.5 flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(-1)}
          aria-label={`${label} −1`}
          className="btn btn-secondary min-w-11 px-3"
        >
          <Minus size={16} aria-hidden="true" />
        </button>
        <span className="min-w-8 text-center text-sm tabular-nums">{value}</span>
        <button
          type="button"
          onClick={() => onChange(1)}
          aria-label={`${label} +1`}
          className="btn btn-secondary min-w-11 px-3"
        >
          <Plus size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function RenamePlan({
  plan,
  labels,
  onFeedback,
}: {
  plan: FloorPlanView;
  labels: Dictionary["staff"]["tables"];
  onFeedback: (feedback: { ok: boolean; message: string }) => void;
}) {
  const [name, setName] = useState(plan.name);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="min-w-48 flex-1">
        <span className="label-caps">{labels.planName}</span>
        <input
          type="text"
          value={name}
          maxLength={60}
          onChange={(event) => setName(event.target.value)}
          className="field mt-1.5"
        />
      </label>
      <button
        type="button"
        disabled={pending || !name.trim() || name.trim() === plan.name}
        onClick={() => {
          startTransition(async () => {
            const result = await renameFloorPlan(plan.id, name);
            onFeedback({
              ok: result.ok,
              message: result.ok ? labels.planSaved : (result.message ?? labels.somethingWrong),
            });
          });
        }}
        className="btn btn-secondary"
      >
        {pending ? labels.saving : labels.rename}
      </button>
    </div>
  );
}

function NewPlan({
  value,
  onChange,
  onCreate,
  pending,
  labels,
}: {
  value: string;
  onChange: (value: string) => void;
  onCreate: () => void;
  pending: boolean;
  /** Bordsytans texter ur ordboken. Rena strängar — komponenten är klientkod. */
  labels: Dictionary["staff"]["tables"];
}) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="min-w-48 flex-1">
        <span className="label-caps">{labels.newPlan}</span>
        <input
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={labels.newPlanPlaceholder}
          className="field mt-1.5"
        />
      </label>
      <button
        type="button"
        onClick={onCreate}
        disabled={pending || !value.trim()}
        className="btn btn-secondary"
      >
        <Plus size={16} aria-hidden="true" />
        {labels.add}
      </button>
    </div>
  );
}

function initialSizes(plans: FloorPlanView[]): PlanSizes {
  return Object.fromEntries(
    plans.map((plan) => [plan.id, { width: plan.width, height: plan.height }]),
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}
