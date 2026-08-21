"use client";

import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { Plus, RotateCw, Save, Trash2, Undo2 } from "lucide-react";
import {
  createFloorPlan,
  deleteFloorPlan,
  saveFloorPlanPositions,
  type TablePosition,
} from "@/app/dashboard/bord/actions";
import { EmptyState } from "@/components/ui/empty-state";
import type { Dictionary } from "@/lib/i18n";
import { LayoutGrid } from "lucide-react";

/**
 * Planritningen.
 *
 * Redigeraren är den svåra delen och den svåraste delen av den är att det ska
 * fungera med fingrar. Därför **pointer events** och inte mouse events: samma
 * kod hanterar mus, penna och finger, och en surfplatta i en restaurang är det
 * mest sannolika stället någon ritar om ett rum.
 *
 * Koordinaterna är i rutnätsenheter. Ritytan skalas till skärmen med en
 * viewBox — hade positionerna varit i pixlar hade rummet ritats om varje gång
 * någon bytte enhet.
 *
 * SVG och inte absolut positionerade divar, av samma skäl: en viewBox gör
 * skalningen till en egenskap hos ritytan i stället för till en uträkning som
 * måste göras om vid varje omrendering.
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
  shape: "ROUND" | "SQUARE" | "RECT";
  width: number;
  height: number;
}

/** Rutnätets steg. Bord fäster mot heltal, vilket räcker för ett rum. */
const SNAP = 1;

export function FloorPlanEditor({
  plans,
  tables,
  labels,
}: {
  plans: FloorPlanView[];
  tables: EditorTable[];
  /** Bordsytans texter ur ordboken. Rena strängar — komponenten är klientkod. */
  labels: Dictionary["staff"]["tables"];
}) {
  const [activePlanId, setActivePlanId] = useState(plans[0]?.id ?? null);
  const [layout, setLayout] = useState<EditorTable[]>(tables);
  /** Varje ändring lägger en kopia här. Ångra är att plocka den senaste. */
  const [history, setHistory] = useState<EditorTable[][]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [newPlanName, setNewPlanName] = useState("");
  const [pending, startTransition] = useTransition();

  const plan = plans.find((candidate) => candidate.id === activePlanId) ?? null;

  const placed = useMemo(
    () => layout.filter((table) => table.floorPlanId === activePlanId && table.x !== null),
    [layout, activePlanId],
  );

  const unplaced = useMemo(
    () => layout.filter((table) => table.floorPlanId === null),
    [layout],
  );

  const dirty = useMemo(
    () => JSON.stringify(layout) !== JSON.stringify(tables),
    [layout, tables],
  );

  /** Sparar nuvarande läge innan en ändring, så att Ångra har något att gå till. */
  const remember = useCallback(() => {
    setHistory((current) => [...current.slice(-49), layout]);
    setFeedback(null);
  }, [layout]);

  function update(id: string, patch: Partial<EditorTable>) {
    setLayout((current) =>
      current.map((table) => (table.id === id ? { ...table, ...patch } : table)),
    );
  }

  function undo() {
    setHistory((current) => {
      const previous = current[current.length - 1];
      if (previous) setLayout(previous);
      return current.slice(0, -1);
    });
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
      }));

    startTransition(async () => {
      const result = await saveFloorPlanPositions(plan.id, positions);
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
        <EmptyState
          icon={LayoutGrid}
          title={labels.planEmptyTitle}
          body={labels.planEmptyBody}
        />
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
              setSelectedId(null);
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

            <button
              type="button"
              onClick={() => {
                if (!selectedId) return;
                remember();
                const table = layout.find((candidate) => candidate.id === selectedId);
                if (table) update(selectedId, { rotation: (table.rotation + 45) % 360 });
              }}
              disabled={!selectedId}
              className="btn btn-secondary"
            >
              <RotateCw size={16} aria-hidden="true" />
              {labels.rotate}
            </button>

            <button
              type="button"
              onClick={() => {
                if (!selectedId) return;
                remember();
                update(selectedId, { floorPlanId: null, x: null, y: null });
                setSelectedId(null);
              }}
              disabled={!selectedId}
              className="btn btn-secondary"
            >
              {labels.removeFromPlan}
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
            selectedId={selectedId}
            onSelect={setSelectedId}
            onBeforeMove={remember}
            onMove={(id, x, y) => update(id, { x, y })}
          />

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
                        update(table.id, {
                          floorPlanId: plan.id,
                          x: Math.round(plan.width / 2),
                          y: Math.round(plan.height / 2),
                        });
                        setSelectedId(table.id);
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
            <div className="mt-3">
              <NewPlan
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
                labels={labels}
              />

              <button
                type="button"
                onClick={() => {
                  if (
                    !window.confirm(
                      `Ta bort ritningen "${plan.name}"? Borden blir kvar men hamnar bland de outplacerade.`,
                    )
                  ) {
                    return;
                  }
                  startTransition(async () => {
                    const result = await deleteFloorPlan(plan.id);
                    if (!result.ok) {
                      setFeedback({ ok: false, message: result.message ?? labels.somethingWrong });
                    }
                  });
                }}
                className="btn btn-secondary mt-3"
              >
                <Trash2 size={16} aria-hidden="true" />
                Ta bort {plan.name}
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
  selectedId,
  onSelect,
  onBeforeMove,
  onMove,
}: {
  plan: FloorPlanView;
  tables: EditorTable[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onBeforeMove: () => void;
  onMove: (id: string, x: number, y: number) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);

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

  function onPointerDown(event: React.PointerEvent, table: EditorTable) {
    const point = toGrid(event);
    if (!point) return;

    onSelect(table.id);
    onBeforeMove();

    // Fångar pekaren så att draget fortsätter även när fingret glider utanför
    // bordet — utan det tappas draget så fort man rör sig snabbt.
    (event.target as Element).setPointerCapture(event.pointerId);

    dragging.current = {
      id: table.id,
      offsetX: point.x - (table.x ?? 0),
      offsetY: point.y - (table.y ?? 0),
    };
  }

  function onPointerMove(event: React.PointerEvent) {
    const drag = dragging.current;
    if (!drag) return;

    const point = toGrid(event);
    if (!point) return;

    const table = tables.find((candidate) => candidate.id === drag.id);
    if (!table) return;

    // Fäster mot rutnätet och håller bordet innanför rummet.
    const x = clamp(Math.round((point.x - drag.offsetX) / SNAP) * SNAP, 0, plan.width - table.width);
    const y = clamp(
      Math.round((point.y - drag.offsetY) / SNAP) * SNAP,
      0,
      plan.height - table.height,
    );

    onMove(drag.id, x, y);
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
        aria-label={`Planritning över ${plan.name}`}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        // `touch-none` stänger av webbläsarens egen panorering. Utan den
        // scrollar sidan i stället för att bordet flyttas.
        className="min-w-[40rem] touch-none rounded-lg border border-[var(--rule)] bg-[var(--surface)]"
        style={{ aspectRatio: `${plan.width} / ${plan.height}` }}
      >
        <defs>
          <pattern id="grid" width="1" height="1" patternUnits="userSpaceOnUse">
            <path
              d="M 1 0 L 0 0 0 1"
              fill="none"
              stroke="currentColor"
              strokeWidth="0.02"
              className="text-[var(--rule)]"
            />
          </pattern>
        </defs>
        <rect width={plan.width} height={plan.height} fill="url(#grid)" />

        {tables.map((table) => (
          <TableShape
            key={table.id}
            table={table}
            isSelected={table.id === selectedId}
            onPointerDown={(event) => onPointerDown(event, table)}
          />
        ))}
      </svg>
    </div>
  );
}

function TableShape({
  table,
  isSelected,
  onPointerDown,
}: {
  table: EditorTable;
  isSelected: boolean;
  onPointerDown: (event: React.PointerEvent) => void;
}) {
  const x = table.x ?? 0;
  const y = table.y ?? 0;
  const cx = x + table.width / 2;
  const cy = y + table.height / 2;

  return (
    <g
      transform={`rotate(${table.rotation} ${cx} ${cy})`}
      onPointerDown={onPointerDown}
      className="cursor-grab"
    >
      {table.shape === "ROUND" ? (
        <ellipse
          cx={cx}
          cy={cy}
          rx={table.width / 2}
          ry={table.height / 2}
          className={isSelected ? "fill-burp-600" : "fill-[var(--background)]"}
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
          className={isSelected ? "fill-burp-600" : "fill-[var(--background)]"}
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
        className={isSelected ? "fill-white" : "fill-[var(--foreground)]"}
        style={{ pointerEvents: "none" }}
      >
        {table.tableNumber}
      </text>
    </g>
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
    <div className="mt-4 flex flex-wrap items-end gap-2">
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}
