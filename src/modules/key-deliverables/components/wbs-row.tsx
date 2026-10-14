"use client";

import { toDateInput } from "@/lib/format";
import { messages } from "@/lib/messages";
import { durationDays, type WbsNode } from "../schemas/wbs";
import { barBox, shortDate, type Timeline } from "./gantt-scale";
import { DraftInput } from "./draft-input";
import { useDrawBar, WbsBar, type BarHandlers } from "./wbs-bar";

const W = messages.keyDeliverables.wbs;

export type WbsTab = "outline" | "chart";

/** What a row asks the editor to do. */
export interface RowHandlers extends BarHandlers {
  select: (id: number) => void;
  toggle: (id: number) => void;
  rename: (id: number, name: string) => void;
  /** Tab / Shift+Tab in the name field: indent or outdent; true when it did. */
  tab: (id: number, shift: boolean) => boolean;
  settle: () => void;
  /** A date or day count typed in the outline. */
  setStart: (id: number, value: string) => void;
  setEnd: (id: number, value: string) => void;
  setDays: (id: number, value: string) => void;
}

const cellInput =
  "h-9 w-full min-w-0 rounded-sm border border-transparent bg-transparent px-1.5 text-sm text-ink " +
  "hover:border-line focus:border-focus focus:outline-none read-only:hover:border-transparent print:border-0";

/** Hidden on phones while the other tab is showing. */
export function tabClass(tab: WbsTab, column: WbsTab): string {
  return tab === column ? "" : "max-md:hidden";
}

/**
 * One item of the breakdown: the sticky name column (code, indented name,
 * show/hide toggle), its start, end and length, and its bar on the timeline.
 */
export function WbsRow({
  node,
  timeline,
  trackStyle,
  todayX,
  selected,
  collapsed,
  changed,
  typing,
  tab,
  canEdit,
  on,
}: {
  node: WbsNode;
  timeline: Timeline;
  trackStyle: React.CSSProperties;
  todayX: number | null;
  selected: boolean;
  collapsed: boolean;
  /** Its dates are being dragged: the date label stands out. */
  changed: boolean;
  /** Tab keeps indenting while the user is working on this item's name. */
  typing: boolean;
  tab: WbsTab;
  canEdit: boolean;
  on: RowHandlers;
}) {
  const id = node.item.id;
  const parent = node.childIds.length > 0;
  const name = node.item.name || messages.keyDeliverables.deliverableFallback(id);
  const dated = node.start !== null && node.end !== null;
  const drawBar = useDrawBar(id, timeline, canEdit && !parent && !dated, on);
  const rowBg = selected ? "bg-accent-soft" : "bg-surface";
  const dateReadOnly = !canEdit || parent;
  const assignees = node.item.assigneeNames;

  return (
    <li
      data-wbs-row={id}
      className={`flex h-11 w-max min-w-full border-b border-line ${rowBg}`}
      onPointerDown={() => on.select(id)}
      onFocusCapture={() => on.select(id)}
    >
      <div
        className={`sticky left-0 z-10 flex w-56 shrink-0 items-center gap-1 border-r border-line pr-2 pl-[calc(var(--depth)*0.875rem)] md:w-80 md:pl-[calc(var(--depth)*1.125rem)] ${rowBg}`}
        style={{ "--depth": node.depth - 1 } as React.CSSProperties}
      >
        {parent ? (
          <button
            type="button"
            aria-expanded={!collapsed}
            aria-label={collapsed ? W.expand(name) : W.collapse(name)}
            onClick={() => on.toggle(id)}
            className="flex min-h-10 min-w-9 shrink-0 cursor-pointer items-center justify-center rounded-sm text-ink-muted hover:bg-surface-raised print:hidden"
          >
            <svg
              viewBox="0 0 16 16"
              aria-hidden="true"
              className={`size-3.5 transition-transform ${collapsed ? "" : "rotate-90"}`}
              fill="currentColor"
            >
              <path d="M5 3l6 5-6 5z" />
            </svg>
          </button>
        ) : (
          <span aria-hidden="true" className="min-w-9 shrink-0" />
        )}
        <span className="shrink-0 text-xs text-ink-muted tabular-nums">{node.code}</span>
        <DraftInput
          data-wbs-name={id}
          aria-label={W.nameOf(node.code)}
          value={node.item.name}
          maxLength={4000}
          readOnly={!canEdit}
          typing={typing}
          onCommit={(next) => on.rename(id, next)}
          onTypedTab={(shift) => on.tab(id, shift)}
          onSettle={on.settle}
          className={`${cellInput} truncate ${parent ? "font-semibold" : ""}`}
        />
      </div>

      <div
        className={`flex w-36 shrink-0 items-center border-r border-line px-1 ${tabClass(tab, "outline")}`}
      >
        <DraftInput
          type="date"
          aria-label={W.startOf(node.code)}
          value={toDateInput(node.start)}
          readOnly={dateReadOnly}
          onCommit={(next) => on.setStart(id, next)}
          className={`${cellInput} tabular-nums ${parent ? "text-ink-muted" : ""}`}
        />
      </div>
      <div
        className={`flex w-36 shrink-0 items-center border-r border-line px-1 ${tabClass(tab, "outline")}`}
      >
        <DraftInput
          type="date"
          aria-label={W.endOf(node.code)}
          value={toDateInput(node.end)}
          readOnly={dateReadOnly}
          onCommit={(next) => on.setEnd(id, next)}
          className={`${cellInput} tabular-nums ${parent ? "text-ink-muted" : ""}`}
        />
      </div>
      <div
        className={`flex w-20 shrink-0 items-center border-r border-line px-1 ${tabClass(tab, "outline")}`}
      >
        {dated && !dateReadOnly ? (
          <DraftInput
            type="number"
            inputMode="numeric"
            min={1}
            max={36500}
            aria-label={`${W.daysHeader}, ${W.nameOf(node.code)}`}
            value={String(durationDays(node.start!, node.end!))}
            onCommit={(next) => on.setDays(id, next)}
            className={`${cellInput} text-right tabular-nums`}
          />
        ) : (
          <span className="w-full px-1.5 text-right text-sm text-ink-muted tabular-nums">
            {dated ? durationDays(node.start!, node.end!) : ""}
          </span>
        )}
      </div>

      <div
        data-wbs-track={id}
        className={`relative shrink-0 ${tabClass(tab, "chart")} ${drawBar.onPointerDown ? "cursor-crosshair touch-none" : ""}`}
        style={{ ...trackStyle, width: timeline.width }}
        {...drawBar}
      >
        {todayX !== null ? (
          <span
            aria-hidden="true"
            className="absolute inset-y-0 w-0.5 bg-danger opacity-60"
            style={{ left: todayX }}
          />
        ) : null}
        {dated ? (
          <>
            <WbsBar
              node={node as WbsNode & { start: Date; end: Date }}
              timeline={timeline}
              editable={canEdit}
              on={on}
            />
            <span
              aria-hidden="true"
              className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-xs whitespace-nowrap tabular-nums ${
                changed
                  ? "rounded-sm bg-surface-raised px-1 py-0.5 font-medium text-ink shadow-sm"
                  : "text-ink-muted"
              }`}
              style={{ left: barRight(timeline, node.start!, node.end!) + 8 }}
            >
              {`${shortDate(node.start!)} – ${shortDate(node.end!)}`}
              {assignees ? ` · ${assignees}` : ""}
            </span>
          </>
        ) : (
          <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-xs text-ink-muted">
            {W.noDates}
          </span>
        )}
      </div>
    </li>
  );
}

function barRight(timeline: Timeline, start: Date, end: Date): number {
  const box = barBox(timeline, start, end);
  return box.left + box.width;
}
