"use client";

import { useCallback, useMemo, useState, type RefObject } from "react";
import { toDateInput } from "@/lib/format";
import { messages } from "@/lib/messages";
import type { Wbs, WbsNode } from "../schemas/wbs";
import type { WbsLink } from "../schemas/wbs-dependencies";
import type { MilestoneChip } from "../schemas/wbs-milestones";
import { GanttCard, GanttMilestone } from "./gantt-card";
import {
  cardOf,
  cardTiles,
  ganttLayout,
  lineGaps,
  type GanttDisplay,
  type GanttLane,
  type GanttLayout,
} from "./gantt-layout";
import { dayCentre, periodCells, todayLeft, type Timeline } from "./gantt-scale";
import { shifted, type Span } from "./gantt-span";
import { isMenuKey, menuBelow, type MenuRequest } from "./wbs-context-menu";
import { useGanttDrag, type GanttDragHandlers } from "./use-gantt-drag";
import { usePrintFit } from "./use-print-fit";
import { WbsDependencyArrows } from "./wbs-dependency-arrows";

const W = messages.keyDeliverables.wbs;
const B = W.board;

/** The column down the left for the group pills. */
export const GANTT_PILL_PX = 52;
/** The column beside it for the lane labels. */
export const GANTT_LABEL_PX = 148;
/** Everything left of the timeline. */
export const GANTT_GUTTER_PX = GANTT_PILL_PX + GANTT_LABEL_PX;

export interface GanttBoardHandlers {
  select(id: number): void;
  /** Shows or hides the item's requirements in the panel under the chart. */
  requirements(id: number): void;
  /** Absent for viewers. */
  priority?(id: number, priority: string | null): void;
  menu(id: number, at: MenuRequest): void;
  open(id: number): void;
  /** Shows the new dates at once and saves them once the keys are still; absent for viewers. */
  nudge?(id: number, span: Span): void;
  /** Saves a nudge now (the card lost focus). */
  flush(): void;
  /** Pointer drags on the cards; absent for viewers. */
  drag?: GanttDragHandlers;
}

/** ← → move a card a day; with Shift they move its end. Milestones and parents only move. */
function nudged(node: WbsNode, event: React.KeyboardEvent): Span | null {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return null;
  if (!node.start || !node.end || event.altKey || event.ctrlKey || event.metaKey) return null;
  const fixed = node.item.isMilestone || node.childIds.length > 0;
  if (event.shiftKey && fixed) return null;
  const days = event.key === "ArrowLeft" ? -1 : 1;
  return shifted({ start: node.start, end: node.end }, event.shiftKey ? "end" : "move", days);
}

function nameOf(node: WbsNode): string {
  return node.item.name || messages.keyDeliverables.deliverableFallback(node.item.id);
}

/** The item a pill, a lane label or a card stands for. */
function itemAt(target: EventTarget): { id: number; el: HTMLElement } | null {
  const el = (target as HTMLElement).closest<HTMLElement>("[data-gantt-item]");
  const id = Number(el?.dataset.ganttItem);
  return el && Number.isInteger(id) ? { id, el } : null;
}

/** Changes whenever a card moves, opens or changes what it shows, so the arrows measure again. */
function geometryOf(layout: GanttLayout, open: ReadonlySet<number>, display: GanttDisplay) {
  const lines = layout.groups.flatMap((g) =>
    g.lanes.flatMap((l) => l.lines.map((line) => line.map((e) => `${e.id}:${e.x}:${e.width}`))),
  );
  return [
    layout.width,
    [...open].join(","),
    Object.values(display).join(","),
    lines.join("/"),
  ].join("|");
}

/**
 * The Gantt: the period header over the project's timeline, dashed period
 * lines, the Today line and the milestones' guides; then a pill per top-level
 * item with sub-items, a labelled lane per second-level one, and the cards
 * packed into lines by their dates. Arrows join dependent cards.
 */
export function GanttBoard({
  scrollRef,
  wbs,
  links,
  timeline,
  today,
  display,
  progress,
  milestones,
  selectedId,
  listingId,
  on,
  tools,
}: {
  scrollRef: RefObject<HTMLDivElement | null>;
  wbs: Wbs;
  links: readonly WbsLink[];
  timeline: Timeline;
  today: Date;
  display: GanttDisplay;
  progress: ReadonlyMap<number, number>;
  milestones: readonly MilestoneChip[];
  selectedId: number | null;
  /** The card whose requirements the panel under the chart shows. */
  listingId: number | null;
  on: GanttBoardHandlers;
  /** The bar floating at the chart's foot; it sits outside the clipped box so its menus show. */
  tools?: React.ReactNode;
}) {
  const [open, setOpen] = useState<ReadonlySet<number>>(() => new Set());
  const layout = useMemo(() => ganttLayout(wbs, timeline), [wbs, timeline]);
  const periods = useMemo(() => periodCells(timeline), [timeline]);
  const todayX = display.today ? todayLeft(timeline, today) : null;
  const reached = new Map(milestones.map((m) => [m.id, m.reached]));
  const guides = display.milestones
    ? milestones.flatMap((m) => (m.date ? [{ ...m, x: dayCentre(timeline, m.date) }] : []))
    : [];
  const geometryKey = geometryOf(layout, open, display);
  const anchorOf = useCallback((id: number) => cardOf(wbs, id), [wbs]);
  const setPriority = on.priority;
  const dragger = useGanttDrag({ wbs, pxPerDay: timeline.pxPerDay, scrollRef, drag: on.drag });
  usePrintFit(scrollRef);

  function toggle(id: number) {
    setOpen((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  function onContextMenu(event: React.MouseEvent) {
    const at = itemAt(event.target);
    if (!at) return;
    event.preventDefault();
    on.select(at.id);
    on.menu(at.id, { x: event.clientX, y: event.clientY, status: false, returnFocus: at.el });
  }

  function onKeyDown(event: React.KeyboardEvent) {
    const at = itemAt(event.target);
    if (!at) return;
    if (isMenuKey(event)) {
      event.preventDefault();
      on.select(at.id);
      on.menu(at.id, menuBelow(event.target as HTMLElement));
      return;
    }
    const node = wbs.nodes.get(at.id);
    const handle = (event.target as HTMLElement).closest("[data-gantt-handle]");
    const nudge = on.nudge;
    const span = handle && node && nudge ? nudged(node, event) : null;
    if (!span || !nudge) return;
    event.preventDefault();
    on.select(at.id);
    nudge(at.id, span);
    // The card may land on another line, which draws it afresh: the keys stay on it.
    requestAnimationFrame(() =>
      scrollRef.current
        ?.querySelector<HTMLElement>(`[data-gantt-handle="${at.id}"]`)
        ?.focus({ preventScroll: false }),
    );
  }

  function onBlur(event: React.FocusEvent) {
    if ((event.target as HTMLElement).closest("[data-gantt-handle]")) on.flush();
  }

  function onDoubleClick(event: React.MouseEvent) {
    const at = itemAt(event.target);
    if (at && (event.target as HTMLElement).closest("[data-gantt-handle]")) on.open(at.id);
  }

  const ring = (id: number | null) =>
    id !== null && id === selectedId
      ? "ring-[3px] ring-coral ring-offset-1 ring-offset-surface"
      : "";

  function drawLane(lane: GanttLane, key: string, divided: boolean) {
    const label = lane.id !== null ? wbs.nodes.get(lane.id) : undefined;
    const dropHere = dragger.overLane === String(lane.parentId ?? "");
    return (
      <div
        key={key}
        data-testid={lane.id !== null ? `gantt-lane-${lane.id}` : undefined}
        data-gantt-lane={lane.parentId ?? ""}
        data-drop-target={dropHere || undefined}
        className={`flex py-2.5 ${divided ? "border-t border-line" : ""} ${dropHere ? "rounded-lg outline-2 -outline-offset-2 outline-coral outline-dashed" : ""}`}
      >
        <div
          className="sticky z-10 shrink-0 bg-surface pr-4 pl-1.5"
          style={{ left: GANTT_PILL_PX, width: GANTT_LABEL_PX }}
        >
          {label ? (
            <button
              type="button"
              data-gantt-item={label.item.id}
              data-testid={`gantt-lane-${label.item.id}-label`}
              title={nameOf(label)}
              onClick={() => on.select(label.item.id)}
              className={`line-clamp-3 w-full cursor-pointer rounded-sm bg-level-2 px-2 py-1 text-left text-xs leading-snug font-medium text-level-ink hover:brightness-95 focus-visible:outline-2 focus-visible:outline-focus print:[print-color-adjust:exact] ${ring(label.item.id)}`}
            >
              <span className="mr-1 text-[10px] opacity-70 tabular-nums">{label.code}</span>
              {nameOf(label)}
            </button>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-col gap-2.5">
          {lane.lines.map((line, i) => {
            const gaps = lineGaps(line);
            return (
              <ul key={i} className="m-0 flex list-none items-start p-0">
                {line.map((entry, j) => {
                  const node = wbs.nodes.get(entry.id)!;
                  const style = { marginLeft: gaps[j], width: entry.width };
                  if (entry.kind === "milestone") {
                    return (
                      <GanttMilestone
                        key={entry.id}
                        node={node}
                        reached={reached.get(entry.id) ?? false}
                        selected={entry.id === selectedId}
                        style={style}
                        onSelect={() => on.select(entry.id)}
                      />
                    );
                  }
                  const id = entry.id;
                  return (
                    <GanttCard
                      key={id}
                      node={node}
                      tiles={
                        open.has(id)
                          ? cardTiles(wbs, id).map((t) => ({
                              node: wbs.nodes.get(t.id)!,
                              depth: t.depth,
                            }))
                          : []
                      }
                      progress={progress.get(id) ?? 0}
                      display={display}
                      open={open.has(id)}
                      selected={id === selectedId}
                      listing={id === listingId}
                      resizable={
                        on.drag !== undefined &&
                        node.start !== null &&
                        !node.item.isMilestone &&
                        node.childIds.length === 0
                      }
                      dragging={dragger.dragging === id}
                      style={style}
                      onSelect={() => on.select(id)}
                      onToggle={() => toggle(id)}
                      onRequirements={() => on.requirements(id)}
                      onPriority={setPriority ? (priority) => setPriority(id, priority) : undefined}
                    />
                  );
                })}
              </ul>
            );
          })}
        </div>
      </div>
    );
  }

  const gutterLabel =
    "sticky left-0 z-10 flex shrink-0 gap-1.5 bg-surface pl-3 text-xs font-medium text-ink-muted";

  return (
    <div className="relative">
      <div className="flow-root overflow-clip rounded-2xl border border-line bg-surface print:overflow-visible print:border-0">
        {/* The scroll padding keeps a card scrolled into view (by focus or a link) clear of the
            sticky header and of the floating tools over the foot. */}
        <div
          ref={scrollRef}
          role="region"
          aria-label={B.label}
          data-testid="gantt-board"
          data-print-fit=""
          className="relative mb-[calc(var(--hbar,0px)*-1)] max-h-[var(--fit-h,calc(100dvh-16rem))] min-h-64 scroll-pt-10 scroll-pb-20 overflow-auto print:mb-0 print:max-h-none print:overflow-visible"
          onContextMenu={onContextMenu}
          onKeyDown={onKeyDown}
          onBlur={onBlur}
          onDoubleClick={onDoubleClick}
          {...dragger.handlers}
        >
          <div className="relative min-w-full" style={{ width: GANTT_GUTTER_PX + layout.width }}>
            <div aria-hidden="true" className="sticky top-0 z-20 flex h-10 bg-surface">
              <span className={`${gutterLabel} items-center`} style={{ width: GANTT_GUTTER_PX }}>
                <span className="text-[10px]">◎</span>
                {B.items}
              </span>
              <div className="relative flex-1">
                {periods.map((cell) => (
                  <span
                    key={cell.key}
                    className="absolute inset-y-0 flex items-center justify-center truncate px-1 text-[13px] font-medium text-ink-muted"
                    style={{ left: cell.left, width: cell.width }}
                  >
                    {cell.label}
                  </span>
                ))}
                {todayX !== null ? (
                  <span
                    className="absolute bottom-0.5 -translate-x-1/2 rounded-md bg-coral px-1.5 text-[10px] leading-4 font-semibold text-on-coral"
                    style={{ left: todayX }}
                  >
                    {B.today}
                  </span>
                ) : null}
              </div>
            </div>

            {guides.length > 0 ? (
              <div className="relative z-10 flex h-11">
                <span
                  aria-hidden="true"
                  className={`${gutterLabel} pt-1`}
                  style={{ width: GANTT_GUTTER_PX }}
                >
                  <span className="text-[10px]">◇</span>
                  {W.milestoneStrip.label}
                </span>
                <ul
                  aria-label={W.milestoneStrip.label}
                  data-testid="gantt-milestone-strip"
                  className="relative m-0 flex-1 list-none p-0"
                >
                  {guides.map((m, k) => (
                    <li
                      key={m.id}
                      data-testid={`gantt-strip-${m.id}`}
                      data-reached={m.reached}
                      className="absolute flex items-center gap-1 text-[11px] font-semibold whitespace-nowrap text-ink"
                      style={{ left: m.x - 6, top: k % 2 === 0 ? 2 : 22 }}
                    >
                      <span
                        aria-hidden="true"
                        className={`size-3 shrink-0 rotate-45 border-2 border-ink ${m.reached ? "bg-ink" : "bg-surface"}`}
                      />
                      {m.name || messages.keyDeliverables.deliverableFallback(m.id)}
                      <span className="font-normal text-ink-muted tabular-nums">
                        {toDateInput(m.date!)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div
              aria-hidden="true"
              className="pointer-events-none absolute top-10 bottom-0"
              style={{ left: GANTT_GUTTER_PX, width: layout.width }}
            >
              {periods.map((cell) => (
                <span
                  key={cell.key}
                  className="absolute inset-y-0 border-l-[1.5px] border-dashed border-line"
                  style={{ left: cell.left }}
                />
              ))}
              {guides.map((m) => (
                <span
                  key={m.id}
                  className={`absolute inset-y-0 border-l-[1.5px] border-ink/35 ${m.reached ? "border-solid" : "border-dotted"}`}
                  style={{ left: m.x }}
                />
              ))}
              {todayX !== null ? (
                <span
                  data-testid="gantt-today"
                  className="absolute inset-y-0 w-0.5 bg-coral opacity-80"
                  style={{ left: todayX - 1 }}
                />
              ) : null}
            </div>

            <div className="relative flex flex-col gap-4 pt-2 pb-20 print:pb-3">
              {layout.groups.map((group, g) => {
                const pill = group.id !== null ? wbs.nodes.get(group.id) : undefined;
                return (
                  <section
                    key={group.id ?? `top${g}`}
                    aria-label={pill ? B.item(pill.code, nameOf(pill)) : B.topLevel}
                    data-testid={pill ? `gantt-group-${pill.item.id}` : undefined}
                    className="flex"
                  >
                    <div
                      className="sticky left-0 z-10 flex shrink-0 justify-center bg-surface py-1"
                      style={{ width: GANTT_PILL_PX }}
                    >
                      {pill ? (
                        <button
                          type="button"
                          data-gantt-item={pill.item.id}
                          data-testid={`gantt-group-${pill.item.id}-pill`}
                          title={`${pill.code} ${nameOf(pill)}`}
                          onClick={() => on.select(pill.item.id)}
                          className={`relative min-h-28 w-[26px] cursor-pointer rounded-full bg-level-1 text-level-ink hover:brightness-95 focus-visible:outline-2 focus-visible:outline-focus print:[print-color-adjust:exact] ${ring(pill.item.id)}`}
                        >
                          <span className="absolute top-1/2 left-1/2 max-h-[calc(100%-2.75rem)] -translate-x-1/2 -translate-y-1/2 rotate-180 truncate text-[11px] font-semibold [writing-mode:vertical-rl]">
                            {pill.code} {nameOf(pill)}
                          </span>
                          <span
                            aria-hidden="true"
                            className="absolute bottom-[7px] left-[7px] size-3 rounded-full bg-level-ink opacity-90"
                          />
                        </button>
                      ) : null}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col">
                      {group.lanes.map((lane, l) =>
                        drawLane(lane, `${lane.id ?? "own"}${l}`, l > 0),
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>

          <WbsDependencyArrows
            scrollRef={scrollRef}
            links={links}
            wbs={wbs}
            geometryKey={geometryKey}
            anchorOf={anchorOf}
          />
        </div>
      </div>
      {tools}
    </div>
  );
}
