"use client";

import { useRef, type DragEvent, type KeyboardEvent, type PointerEvent } from "react";
import { messages } from "@/lib/messages";
import {
  QUADRANTS,
  STAKEHOLDER_DRAG_MIME,
  initials,
  quadrantOf,
  snap,
  type MatrixSummary,
  type PlacedStakeholder,
  type Quadrant,
  type Stance,
} from "../matrix";

const S = messages.stakeholders;

const LEGEND_ORDER: readonly Quadrant[] = ["manage", "satisfied", "informed", "monitor"];

const QUADRANT_TINT: Record<Quadrant, string> = {
  satisfied: "bg-tone-blue-soft",
  manage: "bg-tone-red-soft",
  monitor: "bg-tone-gray-soft",
  informed: "bg-tone-green-soft",
};

const STANCE_DOT: Record<Stance, string> = {
  Champion: "bg-success text-on-success",
  Supporter: "bg-tone-green-ink text-surface",
  Neutral: "bg-tone-gray-ink text-surface",
  Critic: "bg-tone-yellow-ink text-surface",
  Blocker: "bg-danger text-on-danger",
};

const NO_STANCE_DOT = "bg-surface-sunken text-ink";

const ARROWS: Record<string, [number, number]> = {
  ArrowUp: [1, 0],
  ArrowDown: [-1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
};

/**
 * Power runs bottom to top and interest left to right, so the top-right quadrant needs the most
 * attention. Each dot is a button: drag it, or focus it and use the arrow keys (5, or 10 with
 * Shift). A move is reported once, on release or key press, already snapped to the grid.
 */
export function MatrixGrid({
  rows,
  summary,
  selectedId,
  canEdit,
  onSelect,
  onMove,
}: {
  rows: readonly PlacedStakeholder[];
  summary: MatrixSummary;
  selectedId: number | null;
  canEdit: boolean;
  onSelect: (id: number) => void;
  onMove: (id: number, power: number, interest: number) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const dragging = useRef<{ id: number; power: number; interest: number } | null>(null);
  const dots = useRef(new Map<number, HTMLButtonElement>());

  function pointAtXY(clientX: number, clientY: number) {
    const rect = box.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return null;
    return {
      interest: snap(((clientX - rect.left) / rect.width) * 100),
      power: snap(100 - ((clientY - rect.top) / rect.height) * 100),
    };
  }

  function pointAt(event: PointerEvent) {
    return pointAtXY(event.clientX, event.clientY);
  }

  function dragOverGrid(event: DragEvent) {
    if (!canEdit || !event.dataTransfer.types.includes(STAKEHOLDER_DRAG_MIME)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }

  function dropOnGrid(event: DragEvent) {
    if (!canEdit) return;
    const raw = event.dataTransfer.getData(STAKEHOLDER_DRAG_MIME);
    const id = Number(raw);
    const point = pointAtXY(event.clientX, event.clientY);
    if (!raw || !Number.isInteger(id) || !point) return;
    event.preventDefault();
    onSelect(id);
    onMove(id, point.power, point.interest);
  }

  function show(id: number, power: number, interest: number) {
    const dot = dots.current.get(id);
    if (dot) {
      dot.style.left = `${interest}%`;
      dot.style.top = `${100 - power}%`;
    }
  }

  function drag(event: PointerEvent) {
    const current = dragging.current;
    const point = current && pointAt(event);
    if (!current || !point) return;
    current.power = point.power;
    current.interest = point.interest;
    show(current.id, point.power, point.interest);
  }

  function cancel() {
    const current = dragging.current;
    dragging.current = null;
    const row = current && rows.find((r) => r.id === current.id);
    if (row) show(row.id, row.power, row.interest);
  }

  function drop() {
    const current = dragging.current;
    dragging.current = null;
    if (!current) return;
    const row = rows.find((r) => r.id === current.id);
    if (row && (row.power !== current.power || row.interest !== current.interest)) {
      onMove(current.id, current.power, current.interest);
    }
  }

  function nudge(event: KeyboardEvent, row: PlacedStakeholder) {
    const arrow = ARROWS[event.key];
    if (!arrow || !canEdit) return;
    event.preventDefault();
    const step = event.shiftKey ? 10 : 5;
    const power = snap(row.power + arrow[0] * step);
    const interest = snap(row.interest + arrow[1] * step);
    onSelect(row.id);
    if (power !== row.power || interest !== row.interest) onMove(row.id, power, interest);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2">
        <div
          aria-hidden="true"
          className="flex rotate-180 items-center justify-center text-xs font-semibold text-ink-muted uppercase [writing-mode:vertical-rl]"
        >
          {S.power} →
        </div>
        <div>
          <div
            ref={box}
            role="group"
            aria-label={S.matrix.title}
            data-testid="matrix-grid"
            className="relative aspect-[16/10] min-h-60 w-full overflow-hidden rounded-md border border-line bg-surface"
            onPointerMove={drag}
            onPointerUp={drop}
            onPointerCancel={cancel}
            onDragOver={dragOverGrid}
            onDrop={dropOnGrid}
          >
            {QUADRANTS.map((quadrant, index) => (
              <div
                key={quadrant}
                aria-hidden="true"
                className={`pointer-events-none absolute h-1/2 w-1/2 ${QUADRANT_TINT[quadrant]} ${
                  index < 2 ? "top-0" : "bottom-0 border-t border-dashed border-line"
                } ${index % 2 === 1 ? "right-0 border-l border-dashed border-line" : "left-0"}`}
              />
            ))}
            {rows.map((row) => {
              const selected = row.id === selectedId;
              const stance = row.stance ? S.stances[row.stance] : "";
              return (
                <button
                  key={row.id}
                  ref={(el) => {
                    if (el) dots.current.set(row.id, el);
                    else dots.current.delete(row.id);
                  }}
                  type="button"
                  data-testid={`matrix-dot-${row.id}`}
                  aria-pressed={selected}
                  aria-label={[
                    row.name,
                    `${S.power} ${row.power}`,
                    `${S.interest} ${row.interest}`,
                    S.matrix.quadrants[quadrantOf(row.power, row.interest)],
                    stance,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                  title={[row.name, row.role, stance].filter(Boolean).join(" · ")}
                  className={`group absolute flex w-18 -translate-x-1/2 -translate-y-1/2 flex-col items-center focus-visible:z-30 ${
                    canEdit ? "cursor-grab touch-none active:cursor-grabbing" : ""
                  } ${selected ? "z-20" : "z-10"}`}
                  style={{ left: `${row.interest}%`, top: `${100 - row.power}%` }}
                  onPointerDown={(event) => {
                    onSelect(row.id);
                    if (!canEdit || event.button !== 0) return;
                    event.preventDefault();
                    event.currentTarget.setPointerCapture?.(event.pointerId);
                    dragging.current = { id: row.id, power: row.power, interest: row.interest };
                  }}
                  onClick={() => onSelect(row.id)}
                  onKeyDown={(event) => nudge(event, row)}
                >
                  <span
                    aria-hidden="true"
                    className={`grid size-7 place-items-center rounded-full border-2 border-surface font-mono text-[0.625rem] font-bold shadow-sm ${
                      row.stance ? STANCE_DOT[row.stance] : NO_STANCE_DOT
                    } ${selected ? "ring-2 ring-focus ring-offset-1 ring-offset-surface" : ""}`}
                  >
                    {initials(row.name)}
                  </span>
                  <span
                    aria-hidden="true"
                    className={`mt-0.5 max-w-18 truncate rounded-sm bg-surface/90 px-1 text-[0.625rem] font-semibold text-ink transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 ${
                      selected ? "opacity-100" : "opacity-0"
                    }`}
                  >
                    {row.name}
                  </span>
                </button>
              );
            })}
          </div>
          <div
            aria-hidden="true"
            className="mt-1 text-center text-xs font-semibold text-ink-muted uppercase"
          >
            {S.interest} →
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {LEGEND_ORDER.map((quadrant) => (
          <div
            key={quadrant}
            data-testid={`legend-${quadrant}`}
            className={`flex items-baseline justify-between gap-1 rounded-sm border border-line p-2 ${QUADRANT_TINT[quadrant]}`}
          >
            <span className="text-xs font-semibold text-ink">{S.matrix.quadrants[quadrant]}</span>
            <span className="font-mono text-xs text-ink-muted">{summary.byQuadrant[quadrant]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
