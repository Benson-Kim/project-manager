"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAnnouncer } from "@/components/ui/announcer";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useListUrlState } from "@/components/ui/data-view/use-list-url-state";
import { Sheet } from "@/components/ui/dialog";
import { useLookupLists } from "@/components/ui/lookup-lists";
import { EmptyState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import type { ActionResult } from "@/lib/action";
import { formatDate, toDateInput } from "@/lib/format";
import type { OptionColor } from "@/lib/lookup-lists";
import { messages } from "@/lib/messages";
import {
  addWbsItemAction,
  deleteWbsItemAction,
  moveWbsItemAction,
  renameWbsItemAction,
  linkWbsItemsAction,
  rescheduleWbsItemAction,
  setWbsMilestoneAction,
  unlinkWbsItemsAction,
  setWbsStatusAction,
} from "../actions";
import type { StakeholderOption } from "@/modules/stakeholders/repository/stakeholder-options";
import type { KeyDeliverableRow, WbsData } from "../schemas/key-deliverable";
import {
  MAX_WBS_DEPTH,
  NEW_ITEM_DAYS,
  addDays,
  applyMilestone,
  applyMove,
  applyReschedule,
  applyStatus,
  branchRequirementCount,
  buildWbs,
  dayDiff,
  descendantIds,
  durationDays,
  indentTarget,
  milestoneRefusal,
  moveDownTarget,
  moveUpTarget,
  newItemDates,
  outdentTarget,
  requestedDateClash,
  visibleIds,
  wbsBounds,
  type Placement,
  type WbsItem,
} from "../schemas/wbs";
import { DeliverableForm } from "./deliverable-form";
import { readIdSet, writeIdSet } from "./id-set-storage";
import {
  dayAt,
  defaultScale,
  headerRows,
  makeTimeline,
  xOf,
  type GanttScale,
  type Timeline,
} from "./gantt-scale";
import type { Span } from "./wbs-bar";
import {
  WbsContextMenu,
  type MenuCommand,
  type MenuRequest,
  type StatusChoice,
  type WbsMenuState,
} from "./wbs-context-menu";
import { WbsDiagram, type DiagramHandlers } from "./wbs-diagram";
import {
  DEFAULT_CHART,
  chooseBranch,
  parseChartSettings,
  serializeChartSettings,
  type ChartSettings,
  type WbsView,
} from "./wbs-diagram-layout";
import {
  cascadeEffect,
  cascadeSchedule,
  linkRefusal,
  violatedLinks,
  type DependencyType,
  type LinkRefusal,
  type WbsLink,
} from "../schemas/wbs-dependencies";
import { WbsDependenciesDialog } from "./wbs-dependencies-dialog";
import { WbsDependencyArrows } from "./wbs-dependency-arrows";
import { WbsMoveDialog } from "./wbs-move-dialog";
import {
  AddRequirementRow,
  RequirementRow,
  tabClass,
  WbsRow,
  type RowHandlers,
  type WbsTab,
} from "./wbs-row";
import type { QueuedChange } from "./wbs-queue";
import type { RequirementAccess } from "./wbs-requirements";
import { WbsToolbar } from "./wbs-toolbar";
import { useWbsRequirements } from "./use-wbs-requirements";
import { StickyScrollbar } from "@/components/ui/data-view/sticky-scrollbar";

const W = messages.keyDeliverables.wbs;

/** Why a link was refused, as the editor words it; the proc refuses the same four (ADR-0046). */
const LINK_REFUSALS: Record<LinkRefusal, string> = {
  self: W.linkSelf,
  duplicate: W.linkDuplicate,
  related: W.linkRelated,
  cycle: W.linkCycle,
};

/** How long arrow-key nudges wait for the next key before saving. */
const NUDGE_SAVE_MS = 600;

interface PendingOp {
  key: number;
  kind: "add" | "change";
  /** Shows the change before the server confirms it. */
  apply: (items: WbsItem[]) => WbsItem[];
}

/** The rows the server last confirmed, and the stamp of the read that brought them. */
interface Confirmed {
  items: WbsItem[];
  /** Server state: every write answers with the whole breakdown, links included (ADR-0046). */
  links: WbsLink[];
  stamp: number;
}

function sameDay(a: Date | null, b: Date | null): boolean {
  return a === b || (a !== null && b !== null && a.getTime() === b.getTime());
}

/** A yyyy-mm-dd from a date field, as a UTC-midnight day; null when not a usable date. */
function parseDay(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const day = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  const year = day.getUTCFullYear();
  return Number.isNaN(day.getTime()) || year < 1900 || year > 2200 ? null : day;
}

function firstError(error: { message: string; fieldErrors?: Record<string, string[]> }): string {
  return (error.fieldErrors && Object.values(error.fieldErrors).flat()[0]) || error.message;
}

function readChart(key: string): ChartSettings | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? parseChartSettings(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/** Weekend shading and day (or week) lines on every track, without a node per day. */
function trackBackground(timeline: Timeline): React.CSSProperties {
  if (timeline.scale === "month") return {};
  const px = timeline.pxPerDay;
  const week = 7 * px;
  const saturday = (6 - timeline.start.getUTCDay() + 7) % 7;
  return {
    backgroundImage:
      "linear-gradient(to right, var(--line) 0 1px, transparent 1px), " +
      `linear-gradient(to right, var(--surface-sunken) 0 ${2 * px}px, transparent ${2 * px}px)`,
    backgroundSize: `${timeline.scale === "day" ? px : week}px 100%, ${week}px 100%`,
    backgroundPosition: `0 0, ${saturday * px}px 0`,
  };
}

/**
 * The work breakdown and its Gantt in one editor (ADR-0027, checklist row 67).
 * Two views of the same items: the WBS diagram (boxes to add, rename, drag
 * and drop) and the Gantt, whose outline builds the chart beside it. Adding,
 * renaming, indenting, moving or deleting an item, or typing its dates, shows
 * at once in both; dragging or stretching a bar changes the item's dates.
 * Each change is shown first and saved in order behind it; the server answers
 * with the whole breakdown, which replaces the guess, and a refused change is
 * undone.
 */
export function WbsGantt({
  projectId,
  projectName,
  data,
  today,
  initialView,
  initialScale,
  canCreate,
  canEdit,
  canDelete,
  requirementAccess,
  openDeliverable,
  sheetOpen,
  assigneeOptions,
}: {
  projectId: number;
  /** The top box of the diagram. */
  projectName: string;
  data: WbsData;
  /** Today on the server's calendar, so the server and the browser draw the same chart. */
  today: Date;
  /** From ?view=: the WBS diagram or the Gantt. */
  initialView: WbsView;
  /** From ?scale=; null picks one that fits the dates. */
  initialScale: GanttScale | null;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  /** Requirement create/update/delete in this project (requirements:*, ADR-0037); the cascade and
   *  its add controls follow these, not the deliverable permissions. */
  requirementAccess: RequirementAccess;
  /** The item opened from ?d=<id> (the details sheet). */
  openDeliverable?: KeyDeliverableRow;
  sheetOpen: boolean;
  assigneeOptions: StakeholderOption[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { announce } = useAnnouncer();
  const { update: updateUrl } = useListUrlState();

  const [confirmed, setConfirmed] = useState<Confirmed>({
    items: data.items,
    links: data.links,
    stamp: data.stamp,
  });
  const [seenData, setSeenData] = useState(data);
  // A page refresh (the details sheet, an error) brings the breakdown again; it
  // is taken unless older than what the last save answered with. An equal stamp
  // is the same items, possibly with newer assignee names or project dates.
  if (data !== seenData) {
    setSeenData(data);
    if (data.stamp >= confirmed.stamp) {
      setConfirmed({ items: data.items, links: data.links, stamp: data.stamp });
    }
  }
  const confirmedRef = useRef(confirmed);
  useEffect(() => {
    if (confirmed.stamp >= confirmedRef.current.stamp) confirmedRef.current = confirmed;
  }, [confirmed]);

  const [ops, setOps] = useState<PendingOp[]>([]);
  const saving = ops.length > 0;
  // A reload or a closed tab would drop the changes still waiting in the queue.
  useEffect(() => {
    if (!saving) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = messages.feedback.unsavedChangesBody;
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saving]);

  const items = useMemo(
    () => ops.reduce((current, op) => op.apply(current), confirmed.items),
    [ops, confirmed],
  );

  // Colour follows status (ADR-0036).
  const statusList = useLookupLists().lists["key-deliverable.status"];
  const statuses = useMemo<StatusChoice[]>(
    () => (statusList?.options ?? []).map((o) => ({ label: o.label, color: o.color })),
    [statusList],
  );
  const statusColors = useMemo(
    () =>
      new Map(
        statuses.flatMap((s): [string, OptionColor][] => (s.color ? [[s.label, s.color]] : [])),
      ),
    [statuses],
  );
  const wbs = useMemo(() => buildWbs(items, statusColors), [items, statusColors]);

  // Links are server state: a link write answers with the whole breakdown, so the arrows follow the
  // confirmed graph while the bars follow the optimistic rows.
  const links = confirmed.links;
  const linksRef = useRef(links);
  useEffect(() => {
    linksRef.current = links;
  }, [links]);
  const unmet = useMemo(() => violatedLinks(links, wbs).length, [links, wbs]);

  const [preview, setPreview] = useState<{ id: number; span: Span } | null>(null);
  const shown = useMemo(
    () =>
      preview
        ? buildWbs(
            applyReschedule(items, wbs, preview.id, preview.span.start, preview.span.end),
            statusColors,
          )
        : wbs,
    [preview, items, wbs, statusColors],
  );

  const [scale, setScale] = useState<GanttScale>(() => {
    if (initialScale) return initialScale;
    const bounds = wbsBounds(buildWbs(data.items));
    return defaultScale(bounds.min, bounds.max);
  });
  const bounds = useMemo(() => {
    const own = wbsBounds(wbs);
    return own.min ? own : { min: data.projectStart, max: data.projectEnd };
  }, [wbs, data.projectStart, data.projectEnd]);
  const timeline = useMemo(() => makeTimeline(scale, bounds, today), [scale, bounds, today]);
  const header = useMemo(() => headerRows(timeline), [timeline]);
  const trackStyle = useMemo(() => trackBackground(timeline), [timeline]);
  const todayOffset = dayDiff(timeline.start, today);
  const todayX =
    todayOffset >= 0 && todayOffset < timeline.days
      ? xOf(timeline, today) + Math.floor(timeline.pxPerDay / 2)
      : null;

  const storageKey = `wbs-collapsed:${projectId}`;
  const [collapsed, setCollapsed] = useState<ReadonlySet<number>>(() => new Set());
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const saved = readIdSet(storageKey);
      if (saved) setCollapsed(saved);
    });
    return () => cancelAnimationFrame(frame);
  }, [storageKey]);
  const visible = useMemo(() => visibleIds(shown, collapsed), [shown, collapsed]);

  const [menu, setMenu] = useState<WbsMenuState | null>(null);

  // The diagram's zoom, width and per-branch layout: this viewer's, per project, like `collapsed`.
  const chartKey = `wbs-chart:${projectId}`;
  const [chart, setChart] = useState<ChartSettings>(DEFAULT_CHART);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const saved = readChart(chartKey);
      if (saved) setChart(saved);
    });
    return () => cancelAnimationFrame(frame);
  }, [chartKey]);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  // An item hidden in a collapsed branch is not what the toolbar acts on.
  const selected =
    selectedId !== null && visible.includes(selectedId)
      ? (wbs.nodes.get(selectedId) ?? null)
      : null;
  const [typingId, setTypingId] = useState<number | null>(null);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [view, setView] = useState<WbsView>(initialView);
  // An add answers after the user may have switched views; its name opens in the current one.
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);
  const [tab, setTab] = useState<WbsTab>("outline");
  const [confirmId, setConfirmId] = useState<number | null>(null);
  /** The item a "Turn into milestone" is waiting on: the span it drops is named first. */
  const [milestoneId, setMilestoneId] = useState<number | null>(null);
  const [moveId, setMoveId] = useState<number | null>(null);
  const [dependenciesId, setDependenciesId] = useState<number | null>(null);
  /** The field the details form opens on: the Assignees… command, else nothing. */
  const [detailsFocus, setDetailsFocus] = useState<"assignees" | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const nameHeadRef = useRef<HTMLDivElement>(null);
  const axisRef = useRef<HTMLDivElement>(null);

  const [focusRequest, setFocusRequest] = useState<{ id: number; select: boolean } | null>(null);
  useEffect(() => {
    if (!focusRequest) return;
    const input = scrollRef.current?.querySelector<HTMLInputElement>(
      `[data-wbs-name="${focusRequest.id}"]`,
    );
    if (!input) return;
    input.focus();
    if (focusRequest.select) input.select();
  }, [focusRequest]);

  const [scrollAnchor, setScrollAnchor] = useState<{ x: number } | null>(null);
  useEffect(() => {
    const el = scrollRef.current;
    const axis = axisRef.current;
    const nameHead = nameHeadRef.current;
    if (!scrollAnchor || !el || !axis || !nameHead || axis.offsetWidth === 0) return;
    el.scrollLeft +=
      axis.getBoundingClientRect().left + scrollAnchor.x - nameHead.getBoundingClientRect().right;
  }, [scrollAnchor]);

  // ---- saving: one change at a time, in the order they were made ----------

  const queue = useRef<Promise<void>>(Promise.resolve());
  const opKey = useRef(0);

  function enqueue<T extends WbsData>(op: QueuedChange<T>) {
    const key = ++opKey.current;
    const apply = op.apply ?? ((rows: WbsItem[]) => rows);
    setOps((current) => [
      ...current,
      {
        key,
        kind: op.kind ?? "change",
        // Every proc that can move a date later runs the scheduler before it commits, so the rows
        // shown while the save is in flight are pushed the same way (ADR-0046 decision 10).
        apply: (rows) => cascadeSchedule(apply(rows), linksRef.current),
      },
    ]);
    queue.current = queue.current
      .then(async () => {
        let result: ActionResult<T> | null;
        try {
          result = await op.send(confirmedRef.current.items);
        } catch {
          result = { ok: false, error: { code: "INTERNAL", message: messages.errors.INTERNAL } };
        }
        try {
          if (result?.ok) {
            const { items: rows, links: rowLinks, stamp } = result.data;
            if (stamp >= confirmedRef.current.stamp) {
              const next = { items: rows, links: rowLinks, stamp };
              confirmedRef.current = next;
              setConfirmed(next);
            }
            op.done?.(result.data, rows);
          } else if (result) {
            toast({ variant: "error", title: firstError(result.error) });
            router.refresh();
          }
        } finally {
          setOps((current) => current.filter((pending) => pending.key !== key));
        }
      })
      // One failed step must not stop the changes queued after it.
      .catch(() => undefined);
  }

  function withRowVer<T extends WbsData>(
    current: WbsItem[],
    id: number,
    send: (rowVer: number) => Promise<ActionResult<T>>,
  ): Promise<ActionResult<T>> | null {
    const rowVer = current.find((i) => i.id === id)?.rowVer;
    return rowVer === undefined ? null : send(rowVer);
  }

  // ---- changes ---------------------------------------------------------------

  function changeCollapsed(change: (current: ReadonlySet<number>) => ReadonlySet<number>) {
    setCollapsed((current) => {
      const next = change(current);
      writeIdSet(storageKey, next);
      return next;
    });
  }

  function changeChart(change: (current: ChartSettings) => ChartSettings, save = true) {
    setChart((current) => {
      const next = change(current);
      if (save) {
        try {
          window.localStorage.setItem(chartKey, serializeChartSettings(next));
        } catch {
          // Private windows and blocked storage: the chart just forgets.
        }
      }
      return next;
    });
  }

  function expand(id: number) {
    changeCollapsed((current) => {
      if (!current.has(id)) return current;
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }

  function rename(id: number, raw: string) {
    const name = raw.trim();
    const item = wbs.nodes.get(id)?.item;
    if (!canEdit || !item || !name || name === item.name) return;
    enqueue({
      apply: (rows) => rows.map((i) => (i.id === id ? { ...i, name } : i)),
      send: (current) =>
        withRowVer(current, id, (rowVer) => renameWbsItemAction({ id, name, rowVer })),
    });
  }

  function move(id: number, placement: Placement | null) {
    if (!canEdit || !placement) return;
    const code = buildWbs(applyMove(items, id, placement)).nodes.get(id)?.code;
    if (placement.parentId !== null) expand(placement.parentId);
    enqueue({
      apply: (rows) => applyMove(rows, id, placement),
      send: (current) =>
        withRowVer(current, id, (rowVer) =>
          moveWbsItemAction({
            id,
            parentId: placement.parentId,
            position: placement.position,
            rowVer,
          }),
        ),
    });
    if (code) announce(W.moved(code));
  }

  function reschedule(id: number, { start, end }: Span) {
    const node = wbs.nodes.get(id);
    if (!canEdit || !node || (sameDay(node.start, start) && sameDay(node.end, end))) return;
    if (dayDiff(start, end) < 0) {
      toast({
        variant: "error",
        title: messages.errors.dateOrder(
          messages.keyDeliverables.deadline,
          messages.keyDeliverables.startDate,
        ),
      });
      return;
    }
    const clash = requestedDateClash(items, wbs, id, start, end);
    if (clash) {
      toast({
        variant: "error",
        title:
          clash === "item"
            ? messages.errors.dateOrder(
                messages.keyDeliverables.deadline,
                messages.keyDeliverables.requestedDate,
              )
            : clash === "subItem"
              ? W.subItemBeforeRequested
              : W.parentBeforeRequested,
      });
      return;
    }
    const carried = cascadeEffect(applyReschedule(items, wbs, id, start, end), links);
    enqueue({
      apply: (rows) => applyReschedule(rows, buildWbs(rows), id, start, end),
      send: (current) =>
        withRowVer(current, id, (rowVer) =>
          rescheduleWbsItemAction({
            id,
            start: toDateInput(start),
            end: toDateInput(end),
            rowVer,
          }),
        ),
    });
    // A move that carries other items says so, rather than letting bars shift unannounced
    // (ADR-0046 decision 9).
    announce(
      carried.length === 0
        ? W.rescheduled(formatDate(start), formatDate(end))
        : `${W.rescheduled(formatDate(start), formatDate(end))}. ${W.alsoMoved(carried.length)}`,
    );
  }

  /**
   * Add an item after `fromId` (the selected item by default), or as its last sub-item.
   * A milestone is added the same way and is a date from the start (ADR-0046).
   */
  function addItem(
    asSubItem: boolean,
    fromId: number | null = selected?.item.id ?? null,
    asMilestone = false,
  ) {
    const from = fromId !== null ? (wbs.nodes.get(fromId) ?? null) : null;
    if (!canCreate) return;
    if (asSubItem && (!from || from.depth >= MAX_WBS_DEPTH)) return;
    // A milestone takes no sub-items, so one is never added under it.
    if (asSubItem && from!.item.isMilestone) {
      toast({ variant: "info", title: W.milestoneHasSubItems });
      return;
    }
    const parentId = asSubItem ? from!.item.id : (from?.parentId ?? null);
    const afterId = asSubItem ? null : (from?.item.id ?? null);
    const { start, end } = newItemDates(
      wbs,
      { parentId, afterId },
      today,
      data.projectStart,
      asMilestone,
    );
    enqueue({
      kind: "add",
      send: () =>
        addWbsItemAction({
          projectId,
          name: W.newItemName,
          parentId,
          afterId,
          start: toDateInput(start),
          end: toDateInput(end),
          isMilestone: asMilestone,
        }),
      done: (added, rows) => {
        setSelectedId(added.id);
        if (parentId !== null) expand(parentId);
        if (viewRef.current === "wbs") setRenamingId(added.id);
        else setFocusRequest({ id: added.id, select: true });
        announce(W.added(buildWbs(rows).nodes.get(added.id)?.code ?? ""));
      },
    });
  }

  function remove() {
    const id = confirmId;
    setConfirmId(null);
    const node = id !== null ? wbs.nodes.get(id) : undefined;
    if (!canDelete || id === null || !node) return;
    const branch = new Set([id, ...descendantIds(wbs, id)]);
    const siblings = node.parentId === null ? wbs.rootIds : wbs.nodes.get(node.parentId)!.childIds;
    setSelectedId(siblings[node.index + 1] ?? siblings[node.index - 1] ?? node.parentId);
    enqueue({
      apply: (rows) => rows.filter((i) => !branch.has(i.id)),
      send: (current) => withRowVer(current, id, (rowVer) => deleteWbsItemAction({ id, rowVer })),
      done: () => announce(W.deleted),
    });
  }

  function setStatus(id: number, status: string | null) {
    const item = wbs.nodes.get(id)?.item;
    if (!canEdit || !item || item.status === status) return;
    enqueue({
      apply: (rows) => applyStatus(rows, id, status),
      send: (current) =>
        withRowVer(current, id, (rowVer) => setWbsStatusAction({ id, status, rowVer })),
    });
    announce(status ? W.statusChanged(status) : W.statusCleared);
  }

  /**
   * Turn an item into a milestone or back into a task (ADR-0046). Turning one on drops the span,
   * so the caller confirms it first; the refusals the proc would raise are answered here with the
   * reason, so nothing is sent that cannot succeed.
   */
  function setMilestone(id: number, isMilestone: boolean) {
    const item = wbs.nodes.get(id)?.item;
    if (!canEdit || !item || item.isMilestone === isMilestone) return;
    if (isMilestone) {
      const refusal = milestoneRefusal(wbs, id);
      if (refusal) {
        toast({
          variant: "info",
          title: refusal === "subItems" ? W.milestoneHasSubItems : W.milestoneNeedsDate,
        });
        return;
      }
    }
    const code = wbs.nodes.get(id)?.code ?? "";
    enqueue({
      apply: (rows) => applyMilestone(rows, id, isMilestone),
      send: (current) =>
        withRowVer(current, id, (rowVer) => setWbsMilestoneAction({ id, isMilestone, rowVer })),
    });
    announce(isMilestone ? W.becameMilestone(code) : W.becameTask(code));
  }

  // ---- requirements (ADR-0036) -------------------------------------------------

  /**
   * Sequence two items, retype a link, or take one away (ADR-0046). The proc refuses a self-link, a
   * duplicate pair, an ancestor pair and a cycle, and reschedules whatever the link pushes, so each
   * of these is sent rather than mirrored: the answer replaces the breakdown.
   */
  function link(predecessorId: number, type: DependencyType, lagDays: number) {
    const successorId = dependenciesId;
    if (!canEdit || successorId === null) return;
    const refusal = linkRefusal(wbs, links, predecessorId, successorId);
    if (refusal !== null) {
      toast({ variant: "error", title: LINK_REFUSALS[refusal] });
      return;
    }
    enqueue({ send: () => linkWbsItemsAction({ predecessorId, successorId, type, lagDays }) });
    announce(W.linked(wbs.nodes.get(predecessorId)?.code ?? ""));
  }

  function unlink(target: WbsLink) {
    if (!canEdit) return;
    enqueue({ send: () => unlinkWbsItemsAction({ id: target.id, rowVer: target.rowVer }) });
    announce(W.unlinked);
  }

  const cascade = useWbsRequirements({
    projectId,
    items,
    hasItem: (id) => wbs.nodes.has(id),
    access: requirementAccess,
    enqueue,
    announce,
    select: setSelectedId,
  });

  /**
   * Everything that can move a bar: which rows are on screen and where each one's span sits, plus
   * the timeline's own geometry. The arrow layer measures the bars again whenever this changes.
   * Requirement rows and the add row sit between the bars, so their heights are part of it too —
   * which is why the layer measures the DOM instead of computing y from the breakdown.
   */
  const geometryKey = useMemo(
    () =>
      [
        timeline.width,
        timeline.pxPerDay,
        tab,
        visible
          .map((id) => {
            const node = shown.nodes.get(id);
            return `${id}:${node?.start?.getTime() ?? ""}:${node?.end?.getTime() ?? ""}`;
          })
          .join(","),
        cascade.hidden.size,
        cascade.adding ?? "",
        selectedId ?? "",
      ].join("|"),
    [timeline, tab, visible, shown, cascade.hidden, cascade.adding, selectedId],
  );

  // ---- the context menu (ADR-0036) -----------------------------------------------

  function openMenu(id: number, at: MenuRequest) {
    if (!wbs.nodes.has(id)) return;
    setSelectedId(id);
    setTypingId(null);
    setMenu({ id, ...at });
  }

  const closeMenu = useCallback((refocus: boolean) => {
    setMenu((current) => {
      const back = refocus ? current?.returnFocus : null;
      if (back) requestAnimationFrame(() => back.focus());
      return null;
    });
  }, []);

  function openDetails(id: number, focus: "assignees" | null = null) {
    setDetailsFocus(focus);
    updateUrl({ d: String(id) });
  }

  function startRename(id: number) {
    if (!canEdit) return;
    if (view === "wbs") setRenamingId(id);
    else setFocusRequest({ id, select: true });
  }

  function rememberInUrl(key: string, value: string) {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set(key, value);
      window.history.replaceState(null, "", url.toString());
    } catch {
      // The setting still changes; only the link does not remember it.
    }
  }

  function changeView(next: WbsView) {
    if (next === view) return;
    setRenamingId(null);
    setMenu(null);
    setView(next);
    rememberInUrl("view", next);
  }

  function changeScale(next: GanttScale) {
    if (next === scale) return;
    const axis = axisRef.current;
    const nameHead = nameHeadRef.current;
    if (axis && nameHead && axis.offsetWidth > 0) {
      // Only once the timeline is scrolled under the names; before that the dates stay in view.
      const x = nameHead.getBoundingClientRect().right - axis.getBoundingClientRect().left;
      if (x > 0) setScrollAnchor({ x: xOf(makeTimeline(next, bounds, today), dayAt(timeline, x)) });
    }
    setScale(next);
    rememberInUrl("scale", next);
  }

  // ---- bars: drag, stretch, draw and arrow keys -------------------------------

  const previewRef = useRef<{ id: number; span: Span } | null>(null);
  const nudge = useRef<{ timer?: ReturnType<typeof setTimeout> }>({});
  useEffect(() => {
    const state = nudge.current;
    return () => clearTimeout(state.timer);
  }, []);

  function showPreview(id: number, span: Span | null) {
    previewRef.current = span ? { id, span } : null;
    setPreview(previewRef.current);
  }

  function stopNudge(): boolean {
    const waiting = nudge.current.timer !== undefined;
    clearTimeout(nudge.current.timer);
    nudge.current.timer = undefined;
    return waiting;
  }

  function commitBar(id: number, span: Span) {
    stopNudge();
    showPreview(id, null);
    reschedule(id, span);
  }

  function flushNudge() {
    const pending = previewRef.current;
    if (stopNudge() && pending) commitBar(pending.id, pending.span);
  }

  // ---- the outline's fields -----------------------------------------------------

  function setStart(id: number, value: string) {
    const node = wbs.nodes.get(id);
    const start = parseDay(value);
    if (!node || !start || node.childIds.length > 0) return;
    // A milestone is a date: typing one moves the day, both ends with it.
    if (node.item.isMilestone) {
      reschedule(id, { start, end: start });
      return;
    }
    const days = node.start && node.end ? dayDiff(node.start, node.end) : NEW_ITEM_DAYS - 1;
    reschedule(id, { start, end: addDays(start, days) });
  }

  function setEnd(id: number, value: string) {
    const node = wbs.nodes.get(id);
    const end = parseDay(value);
    if (!node || !end || node.childIds.length > 0) return;
    if (node.item.isMilestone) {
      reschedule(id, { start: end, end });
      return;
    }
    reschedule(id, { start: node.start ?? addDays(end, -(NEW_ITEM_DAYS - 1)), end });
  }

  function setDays(id: number, value: string) {
    const node = wbs.nodes.get(id);
    const days = Number(value);
    if (!node?.start || node.item.isMilestone) return;
    if (!Number.isInteger(days) || days < 1 || days > 36500) return;
    reschedule(id, { start: node.start, end: addDays(node.start, days - 1) });
  }

  function tabKey(id: number, shift: boolean): boolean {
    if (!canEdit) return false;
    const node = wbs.nodes.get(id);
    const target = shift ? outdentTarget(wbs, id) : indentTarget(wbs, id);
    if (!target) {
      if (shift || !node || node.index === 0) return false;
      toast({ variant: "info", title: W.maxDepth });
      return true;
    }
    move(id, target);
    setTypingId(id);
    setFocusRequest({ id, select: false });
    return true;
  }

  const rowHandlers: RowHandlers = {
    select: (id) => {
      if (id === selectedId) return;
      setSelectedId(id);
      setTypingId(null);
    },
    toggle: (id) =>
      changeCollapsed((current) => {
        const next = new Set(current);
        if (!next.delete(id)) next.add(id);
        return next;
      }),
    rename,
    tab: tabKey,
    settle: () => setTypingId(null),
    setStart,
    setEnd,
    setDays,
    preview: (id, span) => {
      stopNudge();
      showPreview(id, span);
    },
    nudge: (id, span) => {
      showPreview(id, span);
      stopNudge();
      nudge.current.timer = setTimeout(flushNudge, NUDGE_SAVE_MS);
    },
    flush: flushNudge,
    commit: commitBar,
    open: openDetails,
    menu: openMenu,
  };

  const diagramHandlers: DiagramHandlers = {
    select: rowHandlers.select,
    toggle: rowHandlers.toggle,
    renameStart: (id) => (id === null ? setRenamingId(null) : startRename(id)),
    rename,
    setStart,
    setEnd,
    move,
    open: openDetails,
    remove: (id) => setConfirmId(id),
    tooDeep: () => toast({ variant: "info", title: W.maxDepth }),
    menu: openMenu,
  };

  // ---- toolbar -------------------------------------------------------------------

  const selId = selected?.item.id ?? null;
  const parents = [...wbs.nodes.values()].filter((n) => n.childIds.length > 0);
  const confirmNode = confirmId !== null ? wbs.nodes.get(confirmId) : undefined;
  // Deleting an item only unallocates its requirements, so the dialog counts them (ADR-0037).
  const unallocates = confirmNode ? branchRequirementCount(wbs, confirmNode.item.id) : 0;
  const closeDetails = () => {
    setDetailsFocus(null);
    updateUrl({ d: null });
  };

  const milestoneNode = milestoneId !== null ? wbs.nodes.get(milestoneId) : undefined;
  const menuNode = menu ? wbs.nodes.get(menu.id) : undefined;
  const menuGroups = ((): MenuCommand[][] => {
    if (!menuNode) return [];
    const id = menuNode.item.id;
    return [
      [
        {
          label: W.addItem,
          testId: "wbs-menu-add",
          run: () => addItem(false, id),
          hidden: !canCreate,
        },
        {
          label: W.addSubItem,
          testId: "wbs-menu-add-sub",
          run: () => addItem(true, id),
          hidden: !canCreate,
          disabled: menuNode.depth >= MAX_WBS_DEPTH,
        },
        {
          label: W.addRequirement,
          testId: "wbs-menu-add-requirement",
          run: () => cascade.handlers.openAdd(id),
          hidden: !requirementAccess.canCreate,
        },
        {
          label: W.rename,
          testId: "wbs-menu-rename",
          run: () => startRename(id),
          hidden: !canEdit,
        },
        {
          label: menuNode.item.isMilestone ? W.turnIntoTask : W.turnIntoMilestone,
          testId: "wbs-menu-milestone",
          run: () => (menuNode.item.isMilestone ? setMilestone(id, false) : setMilestoneId(id)),
          hidden: !canEdit,
        },
      ],
      [
        {
          label: W.indent,
          testId: "wbs-menu-indent",
          run: () => move(id, indentTarget(wbs, id)),
          hidden: !canEdit,
          disabled: !indentTarget(wbs, id),
        },
        {
          label: W.outdent,
          testId: "wbs-menu-outdent",
          run: () => move(id, outdentTarget(wbs, id)),
          hidden: !canEdit,
          disabled: !outdentTarget(wbs, id),
        },
        {
          label: W.moveUp,
          testId: "wbs-menu-up",
          run: () => move(id, moveUpTarget(wbs, id)),
          hidden: !canEdit,
          disabled: !moveUpTarget(wbs, id),
        },
        {
          label: W.moveDown,
          testId: "wbs-menu-down",
          run: () => move(id, moveDownTarget(wbs, id)),
          hidden: !canEdit,
          disabled: !moveDownTarget(wbs, id),
        },
        { label: W.moveTo, testId: "wbs-menu-move-to", run: () => setMoveId(id), hidden: !canEdit },
        {
          label: W.dependencies,
          testId: "wbs-menu-dependencies",
          run: () => setDependenciesId(id),
        },
      ],
      [
        { label: W.details, testId: "wbs-menu-details", run: () => openDetails(id) },
        {
          label: W.assignees,
          testId: "wbs-menu-assignees",
          run: () => openDetails(id, "assignees"),
        },
        {
          label: W.delete,
          testId: "wbs-menu-delete",
          run: () => setConfirmId(id),
          hidden: !canDelete,
          danger: true,
        },
      ],
    ];
  })();

  const toolbar = (
    <WbsToolbar
      addItem={{
        run: () => addItem(false),
        hidden: !canCreate,
        pending: ops.some((op) => op.kind === "add"),
      }}
      addSubItem={{
        run: () => addItem(true),
        hidden: !canCreate,
        disabled: !selected || selected.depth >= MAX_WBS_DEPTH || selected.item.isMilestone,
      }}
      addMilestone={{
        run: () => addItem(false, selId, true),
        hidden: !canCreate,
        pending: ops.some((op) => op.kind === "add"),
      }}
      indent={{
        run: () => selId !== null && move(selId, indentTarget(wbs, selId)),
        hidden: !canEdit,
        disabled: selId === null || !indentTarget(wbs, selId),
      }}
      outdent={{
        run: () => selId !== null && move(selId, outdentTarget(wbs, selId)),
        hidden: !canEdit,
        disabled: selId === null || !outdentTarget(wbs, selId),
      }}
      moveUp={{
        run: () => selId !== null && move(selId, moveUpTarget(wbs, selId)),
        hidden: !canEdit,
        disabled: selId === null || !moveUpTarget(wbs, selId),
      }}
      moveDown={{
        run: () => selId !== null && move(selId, moveDownTarget(wbs, selId)),
        hidden: !canEdit,
        disabled: selId === null || !moveDownTarget(wbs, selId),
      }}
      moveTo={{
        run: () => setMoveId(selId),
        hidden: !canEdit,
        disabled: selId === null,
      }}
      subItems={
        view === "wbs" && selected && selected.childIds.length > 0
          ? {
              value: chart.branches.get(selected.item.id) ?? "auto",
              onChange: (layout) =>
                changeChart((current) => ({
                  ...current,
                  branches: chooseBranch(wbs, current.branches, selected.item.id, layout),
                })),
            }
          : null
      }
      rename={{
        run: () => selId !== null && startRename(selId),
        hidden: !canEdit,
        disabled: selId === null,
      }}
      details={{
        run: () => selId !== null && openDetails(selId),
        disabled: selId === null,
      }}
      remove={{
        run: () => setConfirmId(selId),
        hidden: !canDelete,
        disabled: selId === null,
      }}
      expandAll={{ run: () => changeCollapsed(() => new Set()), disabled: collapsed.size === 0 }}
      collapseAll={{
        run: () => changeCollapsed(() => new Set(parents.map((n) => n.item.id))),
        disabled: parents.length === 0,
      }}
      view={view}
      onView={changeView}
      scale={scale}
      onScale={changeScale}
      tab={tab}
      onTab={setTab}
      unmet={unmet}
      saving={saving}
    />
  );

  const headCell =
    "flex shrink-0 items-end border-r border-line pb-1.5 text-xs font-medium text-ink-muted";

  return (
    <div className="flex flex-col gap-3">
      {toolbar}

      {items.length === 0 ? (
        <EmptyState
          title={messages.list.emptyTitle}
          body={W.emptyBody}
          action={
            canCreate ? (
              <Button onClick={() => addItem(false)} pending={ops.some((op) => op.kind === "add")}>
                {W.addItem}
              </Button>
            ) : undefined
          }
        />
      ) : view === "wbs" ? (
        <WbsDiagram
          projectName={projectName}
          wbs={wbs}
          visible={visible}
          collapsed={collapsed}
          selectedId={selectedId}
          renamingId={renamingId}
          canEdit={canEdit}
          canDelete={canDelete}
          chart={chart}
          onChart={changeChart}
          on={diagramHandlers}
          requirementsHidden={cascade.hidden}
          addingRequirement={cascade.adding}
          addRequirementType={cascade.addType}
          requirementAccess={cascade.access}
          onRequirement={cascade.handlers}
          statusColors={statusColors}
        />
      ) : (
        <>
          <div className="flow-root overflow-clip rounded-lg border border-line bg-surface print:overflow-visible print:border-0">
            <div
              ref={scrollRef}
              data-testid="gantt-chart"
              className="relative mb-[calc(var(--hbar,0px)*-1)] max-h-[calc(100dvh-16rem)] min-h-64 overflow-auto print:mb-0 print:max-h-none print:overflow-visible"
            >
              <div className="sticky top-0 z-20 flex h-12 w-max min-w-full border-b border-line bg-surface">
                <div
                  ref={nameHeadRef}
                  className={`${headCell} sticky left-0 z-10 w-56 bg-surface px-3 md:w-80`}
                >
                  {W.itemHeader}
                </div>
                <div className={`${headCell} w-32 px-2.5 ${tabClass(tab, "outline")}`}>
                  {W.status}
                </div>
                <div className={`${headCell} w-36 px-2.5 ${tabClass(tab, "outline")}`}>
                  {W.startHeader}
                </div>
                <div className={`${headCell} w-36 px-2.5 ${tabClass(tab, "outline")}`}>
                  {W.endHeader}
                </div>
                <div className={`${headCell} w-20 justify-end px-2.5 ${tabClass(tab, "outline")}`}>
                  {W.daysHeader}
                </div>
                <div
                  ref={axisRef}
                  aria-hidden="true"
                  className={`relative shrink-0 ${tabClass(tab, "chart")}`}
                  style={{ width: timeline.width }}
                >
                  <div className="relative h-6 border-b border-line">
                    {header.top.map((cell) => (
                      <span
                        key={cell.key}
                        className="absolute inset-y-0 flex items-center truncate border-l border-line px-1.5 text-xs font-medium text-ink"
                        style={{ left: cell.left, width: cell.width }}
                      >
                        {cell.label}
                      </span>
                    ))}
                  </div>
                  <div className="relative h-6">
                    {header.bottom.map((cell) => (
                      <span
                        key={cell.key}
                        className={`absolute inset-y-0 flex items-center justify-center overflow-hidden border-l border-line text-[11px] tabular-nums ${
                          cell.weekend ? "bg-surface-sunken text-ink-muted" : "text-ink-muted"
                        }`}
                        style={{ left: cell.left, width: cell.width }}
                      >
                        {cell.label}
                      </span>
                    ))}
                    {todayX !== null ? (
                      <span
                        className="absolute inset-y-0 w-0.5 bg-danger"
                        style={{ left: todayX }}
                      />
                    ) : null}
                  </div>
                </div>
              </div>

              <ul role="list" className="m-0 list-none p-0">
                {visible.flatMap((id) => {
                  const node = shown.nodes.get(id)!;
                  const before = wbs.nodes.get(id);
                  const requirements = node.item.requirements;
                  const adding = cascade.adding === id;
                  const listShown = !cascade.hidden.has(id) || adding;
                  const rows = [
                    <WbsRow
                      key={id}
                      node={node}
                      timeline={timeline}
                      trackStyle={trackStyle}
                      todayX={todayX}
                      selected={id === selectedId}
                      collapsed={collapsed.has(id)}
                      changed={
                        preview !== null &&
                        (!sameDay(before?.start ?? null, node.start) ||
                          !sameDay(before?.end ?? null, node.end))
                      }
                      typing={id === typingId}
                      tab={tab}
                      canEdit={canEdit}
                      on={rowHandlers}
                      statusColor={
                        node.item.status ? (statusColors.get(node.item.status) ?? null) : null
                      }
                      requirementsHidden={!listShown}
                      onRequirement={cascade.handlers}
                    />,
                  ];
                  if (listShown) {
                    requirements.forEach((requirement, index) =>
                      rows.push(
                        <RequirementRow
                          key={`r${requirement.id}`}
                          node={node}
                          requirement={requirement}
                          index={index}
                          timeline={timeline}
                          trackStyle={trackStyle}
                          tab={tab}
                          access={cascade.access}
                          on={cascade.handlers}
                        />,
                      ),
                    );
                  }
                  // Only under the selected item, to keep the outline short.
                  if (requirementAccess.canCreate && (adding || (id === selectedId && listShown))) {
                    rows.push(
                      <AddRequirementRow
                        key={`add${id}`}
                        node={node}
                        adding={adding}
                        addType={cascade.addType}
                        timeline={timeline}
                        trackStyle={trackStyle}
                        tab={tab}
                        on={cascade.handlers}
                      />,
                    );
                  }
                  return rows;
                })}
              </ul>

              <WbsDependencyArrows
                scrollRef={scrollRef}
                links={links}
                wbs={shown}
                geometryKey={geometryKey}
              />
            </div>
          </div>
          <StickyScrollbar targetRef={scrollRef} />
        </>
      )}

      {moveId !== null && wbs.nodes.has(moveId) ? (
        <WbsMoveDialog
          key={moveId}
          wbs={wbs}
          id={moveId}
          projectName={projectName}
          onClose={() => setMoveId(null)}
          onMove={(placement) => move(moveId, placement)}
        />
      ) : null}

      {dependenciesId !== null && wbs.nodes.has(dependenciesId) ? (
        <WbsDependenciesDialog
          key={dependenciesId}
          wbs={wbs}
          links={links}
          id={dependenciesId}
          canEdit={canEdit}
          onClose={() => setDependenciesId(null)}
          onLink={link}
          onUnlink={unlink}
        />
      ) : null}

      {menu && menuNode ? (
        <WbsContextMenu
          key={`${menu.id}:${menu.x}:${menu.y}:${menu.status}`}
          state={menu}
          node={menuNode}
          groups={menuGroups}
          statuses={statuses}
          canSetStatus={canEdit}
          onStatus={(status) => setStatus(menuNode.item.id, status)}
          onClose={closeMenu}
        />
      ) : null}

      <ConfirmDialog
        open={confirmNode !== undefined}
        onOpenChange={(open) => {
          if (!open) setConfirmId(null);
        }}
        title={
          confirmNode
            ? W.deleteTitle(
                confirmNode.item.name ||
                  messages.keyDeliverables.deliverableFallback(confirmNode.item.id),
                descendantIds(wbs, confirmNode.item.id).length,
              )
            : ""
        }
        body={
          unallocates > 0 ? `${W.deleteBody} ${W.deleteUnallocates(unallocates)}` : W.deleteBody
        }
        confirmLabel={W.delete}
        onConfirm={remove}
      />

      <ConfirmDialog
        open={milestoneNode !== undefined}
        onOpenChange={(open) => {
          if (!open) setMilestoneId(null);
        }}
        title={
          milestoneNode
            ? W.milestoneTitle(
                milestoneNode.item.name ||
                  messages.keyDeliverables.deliverableFallback(milestoneNode.item.id),
              )
            : ""
        }
        body={
          milestoneNode?.start
            ? W.milestoneBody(
                formatDate(milestoneNode.start),
                milestoneNode.end ? durationDays(milestoneNode.start, milestoneNode.end) : 1,
              )
            : W.milestoneNeedsDate
        }
        confirmLabel={W.turnIntoMilestone}
        onConfirm={() => {
          const id = milestoneId;
          setMilestoneId(null);
          if (id !== null) setMilestone(id, true);
        }}
      />

      <Sheet
        open={sheetOpen}
        onOpenChange={(open) => {
          if (!open) closeDetails();
        }}
        title={messages.keyDeliverables.editTitle}
      >
        {openDeliverable ? (
          <DeliverableForm
            key={openDeliverable.KeyDeliverableId}
            projectId={projectId}
            deliverable={openDeliverable}
            assigneeOptions={assigneeOptions}
            canEdit={canEdit}
            canDelete={canDelete}
            focusField={detailsFocus}
            onDone={closeDetails}
          />
        ) : null}
      </Sheet>
    </div>
  );
}
