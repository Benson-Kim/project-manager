"use client";

import { TONES } from "@/components/ui/tones";
import { toDateInput } from "@/lib/format";
import type { OptionColor } from "@/lib/lookup-lists";
import { messages } from "@/lib/messages";
import { durationDays, type WbsNode, type WbsRequirement } from "../schemas/wbs";
import { barBox, shortDate, type Timeline } from "./gantt-scale";
import { DraftInput } from "./draft-input";
import { useDrawBar, WbsBar, type BarHandlers } from "./wbs-bar";
import { isMenuKey, menuBelow, type MenuRequest } from "./wbs-context-menu";
import {
  AddRequirementButton,
  AddRequirementField,
  MetBox,
  RequirementControls,
  RequirementsToggle,
  isPending,
  type RequirementAccess,
  type RequirementHandlers,
} from "./wbs-requirements";

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
  /** Open the item's context menu (ADR-0034). */
  menu: (id: number, at: MenuRequest) => void;
}

const cellInput =
  "h-9 w-full min-w-0 rounded-sm border border-transparent bg-transparent px-1.5 text-sm text-ink " +
  "hover:border-line focus:border-focus focus:outline-none read-only:hover:border-transparent print:border-0";

/** Hidden on phones while the other tab is showing. */
export function tabClass(tab: WbsTab, column: WbsTab): string {
  return tab === column ? "" : "max-md:hidden";
}

/** A right-click on a row opens the item's menu, except over text the user has selected in a field. */
function rowContextMenu(
  event: React.MouseEvent<HTMLElement>,
  id: number,
  on: Pick<RowHandlers, "select" | "menu">,
) {
  const target = event.target as HTMLElement;
  if (
    target instanceof HTMLInputElement &&
    target.selectionStart !== null &&
    target.selectionStart !== target.selectionEnd
  ) {
    return;
  }
  event.preventDefault();
  on.select(id);
  const row = event.currentTarget;
  on.menu(id, { x: event.clientX, y: event.clientY, status: false, returnFocus: row });
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
  statusColor,
  requirementsHidden,
  onRequirement,
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
  /** The status's own colour, for the status cell; null when it has none. */
  statusColor: OptionColor | null;
  requirementsHidden: boolean;
  onRequirement: RequirementHandlers;
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
      onContextMenu={(event) => rowContextMenu(event, id, on)}
      onKeyDown={(event) => {
        if (!isMenuKey(event)) return;
        event.preventDefault();
        on.menu(id, menuBelow(event.target as HTMLElement));
      }}
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
        {node.item.requirements.length > 0 ? (
          <RequirementsToggle
            node={node}
            hidden={requirementsHidden}
            on={onRequirement}
            className="flex min-h-9 shrink-0 cursor-pointer items-center gap-1 rounded-sm px-1 text-xs text-ink-muted tabular-nums hover:bg-surface-raised hover:text-ink print:hidden"
          />
        ) : null}
      </div>

      <div
        className={`flex w-32 shrink-0 items-center border-r border-line px-1.5 ${tabClass(tab, "outline")}`}
      >
        {node.item.status || canEdit ? (
          <button
            type="button"
            data-testid={`wbs-row-status-${id}`}
            aria-haspopup="menu"
            aria-label={W.statusOf(node.code, node.item.status ?? W.noStatus)}
            onClick={(event) => on.menu(id, menuBelow(event.currentTarget, true))}
            className={`inline-flex min-h-7 max-w-full cursor-pointer items-center rounded-full border px-2 text-xs font-medium ${
              statusColor ? TONES[statusColor].badge : "border-line bg-surface text-ink-muted"
            } ${canEdit ? "hover:border-focus" : "cursor-default"} print:border-0 print:px-0`}
          >
            <span className="truncate">{node.item.status ?? W.noStatus}</span>
          </button>
        ) : null}
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

/** The outline cells under an item's own: indented one level deeper than it. */
function SubRowName({
  node,
  rowBg,
  children,
}: {
  node: WbsNode;
  rowBg: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`sticky left-0 z-10 flex w-56 shrink-0 items-center gap-1.5 border-r border-line pr-2 pl-[calc(var(--depth)*0.875rem+2.75rem)] md:w-80 md:pl-[calc(var(--depth)*1.125rem+2.75rem)] ${rowBg}`}
      style={{ "--depth": node.depth - 1 } as React.CSSProperties}
    >
      {children}
    </div>
  );
}

/** The empty outline columns and track of a row that has no dates of its own. */
function EmptyCells({
  tab,
  timeline,
  trackStyle,
  controls,
}: {
  tab: WbsTab;
  timeline: Timeline;
  trackStyle: React.CSSProperties;
  /** Shown in the Status column, which a requirement has none of. */
  controls?: React.ReactNode;
}) {
  const cell = `flex shrink-0 items-center border-r border-line px-1 ${tabClass(tab, "outline")}`;
  return (
    <>
      <div className={`${cell} w-32`}>{controls}</div>
      <div className={`${cell} w-36`} />
      <div className={`${cell} w-36`} />
      <div className={`${cell} w-20`} />
      <div
        aria-hidden="true"
        className={`shrink-0 ${tabClass(tab, "chart")}`}
        style={{ ...trackStyle, width: timeline.width }}
      />
    </>
  );
}

/**
 * One requirement under its item in the Gantt's outline (ADR-0034), the way
 * the minutes cascade discussion points under an agenda item: its tick box and
 * wording in the name column, Move up, Move down and Delete in the Status
 * column, and an empty track (requirements have no bar).
 */
export function RequirementRow({
  node,
  requirement,
  index,
  timeline,
  trackStyle,
  tab,
  access,
  on,
}: {
  node: WbsNode;
  requirement: WbsRequirement;
  index: number;
  timeline: Timeline;
  trackStyle: React.CSSProperties;
  tab: WbsTab;
  access: RequirementAccess;
  on: RequirementHandlers;
}) {
  const count = node.item.requirements.length;
  return (
    <li
      data-wbs-req-row={requirement.id}
      className="flex h-9 w-max min-w-full border-b border-line bg-surface"
    >
      <SubRowName node={node} rowBg="bg-surface">
        <MetBox requirement={requirement} canEdit={access.canEdit} on={on} />
        <DraftInput
          aria-label={W.editRequirement(requirement.text)}
          value={requirement.text}
          maxLength={4000}
          readOnly={!access.canEdit || isPending(requirement)}
          onCommit={(next) => {
            if (next.trim()) on.edit(requirement.id, next.trim());
          }}
          className={`${cellInput} h-8 truncate text-xs ${
            requirement.isMet ? "text-ink-muted line-through" : ""
          }`}
        />
      </SubRowName>
      <EmptyCells
        tab={tab}
        timeline={timeline}
        trackStyle={trackStyle}
        controls={
          <RequirementControls
            requirement={requirement}
            index={index}
            count={count}
            access={access}
            on={on}
          />
        }
      />
    </li>
  );
}

/** "Add requirement" (or its field) under the selected item in the Gantt's outline. */
export function AddRequirementRow({
  node,
  adding,
  timeline,
  trackStyle,
  tab,
  on,
}: {
  node: WbsNode;
  adding: boolean;
  timeline: Timeline;
  trackStyle: React.CSSProperties;
  tab: WbsTab;
  on: RequirementHandlers;
}) {
  return (
    <li className="flex h-9 w-max min-w-full border-b border-line bg-surface print:hidden">
      <SubRowName node={node} rowBg="bg-surface">
        {adding ? (
          <AddRequirementField
            node={node}
            on={on}
            className="h-8 w-full min-w-0 rounded-sm border border-focus bg-surface px-1.5 text-xs text-ink focus:outline-none"
          />
        ) : (
          <AddRequirementButton
            node={node}
            on={on}
            className="min-h-7 cursor-pointer rounded-sm border border-dashed border-line px-2 text-xs text-ink-muted hover:bg-surface-raised hover:text-ink"
          />
        )}
      </SubRowName>
      <EmptyCells tab={tab} timeline={timeline} trackStyle={trackStyle} />
    </li>
  );
}
