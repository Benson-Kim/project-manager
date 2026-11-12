"use client";

import { messages } from "@/lib/messages";
import { FLOW_KINDS, type FlowKind, type ShapeKind } from "../model/diagram";
import { PALETTE_GROUPS } from "../model/shapes";
import { FLOW_DASH } from "../model/svg";
import { GlyphIcon } from "./glyph";

const M = messages.bpmn;

/** The drag payload a palette item carries onto the canvas: a symbol kind, or a pool. */
export const DRAG_TYPE = "application/x-bpmn-item";
export type PaletteItem = ShapeKind | "pool";

const ITEM =
  "flex flex-col items-center gap-0.5 rounded-md border border-transparent p-1 text-center text-[11px] leading-tight text-ink hover:border-line hover:bg-surface-raised focus-visible:border-accent focus-visible:outline-none";

function FlowIcon({ kind }: { kind: FlowKind }) {
  const arrow = kind === "association" ? null : kind === "message" ? "open" : "solid";
  return (
    <svg width="40" height="12" viewBox="0 0 40 12" aria-hidden="true">
      {kind === "message" ? (
        <circle cx="4" cy="6" r="3" style={{ fill: "var(--surface)", stroke: "var(--ink)" }} />
      ) : null}
      <path
        d={`M ${kind === "message" ? 7 : 2} 6 L ${arrow ? 31 : 38} 6`}
        style={{ stroke: "var(--ink)", strokeWidth: 1.5, strokeDasharray: FLOW_DASH[kind] }}
      />
      {kind === "default" ? (
        <path d="M 6 10 L 12 2" style={{ stroke: "var(--ink)", strokeWidth: 1.5 }} />
      ) : null}
      {arrow ? (
        <path
          d="M 30 1 L 39 6 L 30 11 Z"
          style={{
            fill: arrow === "solid" ? "var(--ink)" : "var(--surface)",
            stroke: "var(--ink)",
            strokeWidth: 1,
          }}
        />
      ) : null}
    </svg>
  );
}

function PoolIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
      <rect
        x="1"
        y="5"
        width="26"
        height="18"
        style={{ fill: "none", stroke: "var(--ink-muted)", strokeWidth: 1.5 }}
      />
      <path
        d="M 6 5 L 6 23 M 6 14 L 27 14"
        style={{ stroke: "var(--ink-muted)", strokeWidth: 1.5 }}
      />
    </svg>
  );
}

/**
 * The symbols: a click places one in the middle of the view, a drag places it where it is dropped.
 * The connector type picked here is the one new connections take.
 */
export function Palette({
  connector,
  onConnector,
  onAdd,
}: {
  connector: FlowKind;
  onConnector: (kind: FlowKind) => void;
  onAdd: (item: PaletteItem) => void;
}) {
  const drag = (item: PaletteItem) => (event: React.DragEvent) => {
    event.dataTransfer.setData(DRAG_TYPE, item);
    event.dataTransfer.effectAllowed = "copy";
  };
  return (
    <aside
      aria-label={M.palette}
      data-testid="bpmn-palette"
      className="flex min-h-0 flex-col gap-3 overflow-y-auto border-b border-line p-2 lg:border-r lg:border-b-0 print:hidden"
    >
      {PALETTE_GROUPS.map(({ group, kinds }) => (
        <section key={group} aria-label={M.groups[group]}>
          <h3 className="mb-1 text-xs font-semibold text-ink-muted">{M.groups[group]}</h3>
          <div className="grid grid-cols-3 gap-0.5 lg:grid-cols-2">
            {kinds.map((kind) => (
              <button
                key={kind}
                type="button"
                draggable
                data-testid={`bpmn-palette-${kind}`}
                className={ITEM}
                onClick={() => onAdd(kind)}
                onDragStart={drag(kind)}
              >
                <GlyphIcon kind={kind} />
                <span>{M.shapes[kind]}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
      <section aria-label={M.groups.swimlanes}>
        <h3 className="mb-1 text-xs font-semibold text-ink-muted">{M.groups.swimlanes}</h3>
        <button
          type="button"
          draggable
          data-testid="bpmn-palette-pool"
          className={`${ITEM} w-full`}
          onClick={() => onAdd("pool")}
          onDragStart={drag("pool")}
        >
          <PoolIcon />
          <span>{M.pool}</span>
        </button>
      </section>
      <section aria-label={M.groups.connectors}>
        <h3 className="mb-1 text-xs font-semibold text-ink-muted">{M.groups.connectors}</h3>
        <div role="radiogroup" aria-label={M.flowType} className="flex flex-col gap-0.5">
          {FLOW_KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              role="radio"
              aria-checked={connector === kind}
              data-testid={`bpmn-connector-${kind}`}
              className={`flex items-center gap-2 rounded-md border px-1.5 py-1 text-left text-[11px] text-ink ${
                connector === kind
                  ? "border-accent bg-surface-raised"
                  : "border-transparent hover:border-line hover:bg-surface-raised"
              }`}
              onClick={() => onConnector(kind)}
            >
              <FlowIcon kind={kind} />
              <span>{M.flows[kind]}</span>
            </button>
          ))}
        </div>
        <p className="mt-1 text-[11px] leading-tight text-ink-muted">{M.connectorHint}</p>
      </section>
    </aside>
  );
}
