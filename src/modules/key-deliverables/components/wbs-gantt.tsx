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
  setWbsNoteAction,
  setWbsStatusAction,
  updateWbsItemAction,
} from "../actions";
import type { RequirementOption } from "@/modules/requirements/schemas/requirement";
import type { StakeholderOption } from "@/modules/stakeholders/repository/stakeholder-options";
import type { KeyDeliverableRow, WbsData } from "../schemas/key-deliverable";
import {
  MAX_WBS_DEPTH,
  NEW_ITEM_DAYS,
  addDays,
  applyMilestone,
  DONE_STATUS,
  applyDetails,
  applyMove,
  applyNote,
  applyReschedule,
  applyStatus,
  branchRequirementCount,
  buildWbs,
  dayDiff,
  descendantIds,
  detailsInput,
  durationDays,
  indentTarget,
  itemProgress,
  milestoneRefusal,
  moveDownTarget,
  moveUpTarget,
  newItemDates,
  outdentTarget,
  requestedDateClash,
  rolledBudget,
  visibleIds,
  wbsBounds,
  type Placement,
  type WbsDetailsPatch,
  type WbsItem,
} from "../schemas/wbs";
import { DeliverableForm } from "./deliverable-form";
import { readIdSet, writeIdSet } from "./id-set-storage";
import { dayAt, defaultScale, makeTimeline, xOf, type GanttScale } from "./gantt-scale";
import { GanttBoard, type GanttBoardHandlers } from "./gantt-board";
import { GanttRequirementsPanel } from "./gantt-requirements-panel";
import { ganttSummary } from "./gantt-summary";
import { GanttTools } from "./gantt-tools";
import { useGanttDisplay } from "./use-gantt-display";
import type { Span } from "./gantt-span";
import {
  WbsContextMenu,
  type MenuCommand,
  type MenuRequest,
  type StatusChoice,
  type WbsMenuState,
} from "./wbs-context-menu";
import { WbsDiagram, type DiagramHandlers } from "./wbs-diagram";
import {
  BRANCH_LAYOUTS,
  DEFAULT_CHART,
  branchLayout,
  chooseBranch,
  parseChartSettings,
  serializeChartSettings,
  type BranchLayout,
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
import { WbsMoveDialog } from "./wbs-move-dialog";
import { WbsDetailsPanel } from "./wbs-details-panel";
import { PlanNote } from "./wbs-plan-note";
import { firstError, type QueuedChange } from "./wbs-queue";
import { wbsCsv } from "./wbs-csv";
import { useFullscreen } from "./use-fullscreen";
import {
  canUndo,
  dropUndo,
  moveBack,
  pushUndo,
  rescheduleBack,
  takeUndo,
  type UndoStep,
} from "../schemas/wbs-undo";
import { NO_FILTER, shownWbs, wbsShown, type WbsFilter } from "../schemas/wbs-filter";
import { milestoneStrip } from "../schemas/wbs-milestones";
import { WbsFilterBar } from "./wbs-filter-bar";
import { isEditableTarget } from "@/components/ui/data-view/datasheet";
import type { RequirementAccess } from "./wbs-requirements";
import { WbsToolbar } from "./wbs-toolbar";
import { useWbsRequirements } from "./use-wbs-requirements";
import { RequirementOwnersContext } from "./wbs-requirement-more";
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

const NOTHING: ReadonlySet<number> = new Set();

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

function readChart(key: string): ChartSettings | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? parseChartSettings(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
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
  needOptions,
  planNote,
}: {
  projectId: number;
  /** The top box of the diagram. */
  projectName: string;
  /** The project's sticky note and the project row version it saves against. */
  planNote: { text: string | null; rowVer: number };
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
  /** The project's business and stakeholder requirements a new requirement can meet. */
  needOptions: RequirementOption[];
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
  const budgets = useMemo(() => rolledBudget(wbs), [wbs]);
  const milestoneChips = useMemo(() => milestoneStrip(wbs, today), [wbs, today]);

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
  const progress = useMemo(() => itemProgress(shown), [shown]);
  const [display, changeDisplay] = useGanttDisplay();
  /** The card whose requirements show in the panel under the Gantt. */
  const [listingId, setListingId] = useState<number | null>(null);

  const storageKey = `wbs-collapsed:${projectId}`;
  const [collapsed, setCollapsed] = useState<ReadonlySet<number>>(() => new Set());
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const saved = readIdSet(storageKey);
      if (saved) setCollapsed(saved);
    });
    return () => cancelAnimationFrame(frame);
  }, [storageKey]);

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
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [view, setView] = useState<WbsView>(initialView);

  // The WBS diagram's search and chips, for this visit only. A search opens every branch and list
  // on the way to a match and folds on its own while it lasts; chips alone keep the viewer's folds.
  const [filter, setFilter] = useState<WbsFilter>(NO_FILTER);
  const filtered = useMemo(
    () => (view === "wbs" ? wbsShown(wbs, filter) : null),
    [view, wbs, filter],
  );
  const searching = filtered !== null && filter.text.trim() !== "";
  const [searchFolds, setSearchFolds] = useState<ReadonlySet<number>>(NOTHING);
  const folds = searching ? searchFolds : collapsed;
  const visible = useMemo(
    () => visibleIds(filtered ? shownWbs(shown, filtered.items) : shown, folds),
    [shown, filtered, folds],
  );
  // An item hidden in a collapsed branch, or by the filter, is not what the toolbar acts on. The
  // Gantt folds nothing away.
  const selected =
    selectedId !== null && (view === "gantt" || visible.includes(selectedId))
      ? (wbs.nodes.get(selectedId) ?? null)
      : null;
  const listed = listingId !== null ? (wbs.nodes.get(listingId) ?? null) : null;
  // An add answers after the user may have switched views; its name opens in the current one.
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  /** The item a "Turn into milestone" is waiting on: the span it drops is named first. */
  const [milestoneId, setMilestoneId] = useState<number | null>(null);
  const [moveId, setMoveId] = useState<number | null>(null);
  const [dependenciesId, setDependenciesId] = useState<number | null>(null);
  /** The field the details form opens on: the Assignees… command, else nothing. */
  const [detailsFocus, setDetailsFocus] = useState<"assignees" | null>(null);

  const editorRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [focusRequest, setFocusRequest] = useState<{ id: number; select: boolean } | null>(null);
  useEffect(() => {
    if (!focusRequest) return;
    const input = editorRef.current?.querySelector<HTMLInputElement>(
      `[data-wbs-details-name="${focusRequest.id}"]`,
    );
    if (!input) return;
    input.focus();
    if (focusRequest.select) input.select();
  }, [focusRequest]);

  const [scrollAnchor, setScrollAnchor] = useState<{ x: number } | null>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (scrollAnchor && el) el.scrollLeft = scrollAnchor.x;
  }, [scrollAnchor]);

  // ---- saving: one change at a time, in the order they were made ----------

  const queue = useRef<Promise<void>>(Promise.resolve());
  const opKey = useRef(0);

  const fullscreen = useFullscreen();

  // Moves and reschedules can be taken back, newest first; each step back is a change of its own.
  const [undoStack, setUndoStack] = useState<UndoStep[]>([]);
  const undoKey = useRef(0);

  /** Remembers a step back; a refused change forgets it again. */
  function remember(step: UndoStep | null): (() => void) | undefined {
    if (!step) return undefined;
    setUndoStack((current) => pushUndo(current, step));
    return () => setUndoStack((current) => dropUndo(current, step.key));
  }

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
          } else {
            if (result) {
              toast({ variant: "error", title: firstError(result.error) });
              router.refresh();
            }
            op.failed?.();
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

  /** The folds on screen: while searching, the search's own, which the viewer's never see. */
  function changeFolds(change: (current: ReadonlySet<number>) => ReadonlySet<number>) {
    if (searching) setSearchFolds(change);
    else changeCollapsed(change);
  }

  function changeFilter(next: WbsFilter) {
    if (next.text.trim() && !filter.text.trim()) setSearchFolds(NOTHING);
    setFilter(next);
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

  function move(id: number, placement: Placement | null, undoable = true) {
    if (!canEdit || !placement) return;
    const code = buildWbs(applyMove(items, id, placement)).nodes.get(id)?.code;
    if (placement.parentId !== null) expand(placement.parentId);
    const forget = undoable ? remember(moveBack(wbs, id, placement, ++undoKey.current)) : undefined;
    enqueue({
      apply: (rows) => applyMove(rows, id, placement),
      failed: forget,
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

  function reschedule(id: number, { start, end }: Span, undoable = true) {
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
    const forget = undoable ? remember(rescheduleBack(wbs, id, ++undoKey.current)) : undefined;
    enqueue({
      apply: (rows) => applyReschedule(rows, buildWbs(rows), id, start, end),
      failed: forget,
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

  /** Takes back the newest move or reschedule that still applies, through the queue like any change. */
  function undo() {
    if (!canEdit) return;
    // A nudge still waiting to save is the newest move: dropping it takes it back.
    if (stopNudge()) {
      showPreview(0, null);
      announce(W.moveUndone);
      return;
    }
    const { step, rest } = takeUndo(undoStack, wbs);
    setUndoStack(rest);
    if (!step) return;
    if (step.kind === "move") move(step.id, step.placement, false);
    else reschedule(step.id, step, false);
    setSelectedId(step.id);
    announce(W.moveUndone);
  }

  async function copyText(text: string, copied: string, failed: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast({ variant: "success", title: copied });
    } catch {
      toast({ variant: "error", title: failed });
    }
  }

  // The byte-order mark is for files a spreadsheet opens, not for pasted text.
  const copyCsv = () => copyText(wbsCsv(wbs).replace(/^﻿/, ""), W.csv.copied, W.csv.copyFailed);
  const copySummary = () =>
    copyText(ganttSummary(projectName, wbs), W.board.summaryCopied, W.board.summaryCopyFailed);

  /** Ctrl+Z (Cmd+Z) belongs to the field being typed in; anywhere else in the editor it is Undo move. */
  function undoKeys(event: React.KeyboardEvent<HTMLElement>) {
    const target = event.target as HTMLElement;
    if (
      !(event.ctrlKey || event.metaKey) ||
      event.shiftKey ||
      event.altKey ||
      event.key.toLowerCase() !== "z" ||
      (isEditableTarget(target) && target.tagName !== "BUTTON") ||
      !event.currentTarget.contains(target)
    ) {
      return;
    }
    event.preventDefault();
    undo();
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

  /** A change from the details panel (ADR-0052). The whole update is built from the item as the
   *  server last answered when it is sent, so changes queued one after another all land. */
  function updateDetails(id: number, patch: WbsDetailsPatch) {
    if (!canEdit || !wbs.nodes.has(id)) return;
    enqueue({
      apply: (rows) => applyDetails(rows, id, patch),
      send: (current) => {
        const item = current.find((i) => i.id === id);
        return item ? updateWbsItemAction(detailsInput(item, projectId, patch)) : null;
      },
    });
  }

  /** The paperclip note (ADR-0052), saved in the queue so it carries the item's current RowVer. */
  function setNote(id: number, text: string): Promise<boolean> {
    if (!canEdit || !wbs.nodes.has(id)) return Promise.resolve(false);
    return new Promise((resolve) =>
      enqueue({
        apply: (rows) => applyNote(rows, id, text),
        send: (current) =>
          withRowVer(current, id, (rowVer) => setWbsNoteAction({ id, note: text, rowVer })),
        done: () => resolve(true),
        failed: () => resolve(false),
      }),
    );
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

  // ---- the context menu (ADR-0036) -----------------------------------------------

  function openMenu(id: number, at: MenuRequest) {
    if (!wbs.nodes.has(id)) return;
    setSelectedId(id);
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
    // The day at the chart's left edge stays there.
    const x = scrollRef.current?.scrollLeft ?? 0;
    if (x > 0) setScrollAnchor({ x: xOf(makeTimeline(next, bounds, today), dayAt(timeline, x)) });
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

  function setPriority(id: number, priority: string | null) {
    if (wbs.nodes.get(id)?.item.priority !== priority) updateDetails(id, { priority });
  }

  const boardHandlers: GanttBoardHandlers = {
    select: setSelectedId,
    requirements: (id) => setListingId((current) => (current === id ? null : id)),
    priority: canEdit ? setPriority : undefined,
    menu: openMenu,
    open: openDetails,
    nudge: canEdit
      ? (id, span) => {
          showPreview(id, span);
          stopNudge();
          nudge.current.timer = setTimeout(flushNudge, NUDGE_SAVE_MS);
        }
      : undefined,
    flush: flushNudge,
    drag: canEdit
      ? {
          preview: (id, span) => {
            // A nudge still waiting is saved first: the drag started from its dates.
            if (nudge.current.timer !== undefined) flushNudge();
            showPreview(id, span);
          },
          commit: commitBar,
          move: (id, placement) => move(id, placement),
        }
      : undefined,
  };

  const diagramHandlers: DiagramHandlers = {
    select: setSelectedId,
    toggle: (id) =>
      changeFolds((current) => {
        const next = new Set(current);
        if (!next.delete(id)) next.add(id);
        return next;
      }),
    renameStart: (id) => (id === null ? setRenamingId(null) : startRename(id)),
    rename,
    setStart,
    setEnd,
    move,
    open: openDetails,
    remove: (id) => setConfirmId(id),
    tooDeep: () => toast({ variant: "info", title: W.maxDepth }),
    menu: openMenu,
    note: setNote,
    priority: canEdit ? setPriority : undefined,
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
  function setBranchLayout(id: number, layout: BranchLayout) {
    changeChart((current) => ({
      ...current,
      branches: chooseBranch(wbs, current.branches, id, layout),
    }));
  }
  const menuGroups = ((): MenuCommand[][] => {
    if (!menuNode) return [];
    const id = menuNode.item.id;
    const layout = branchLayout(chart.branches, id);
    const layoutCommands: MenuCommand[] =
      view === "wbs" && menuNode.childIds.length > 0
        ? BRANCH_LAYOUTS.map((choice) => ({
            label: W.showSubItems[choice],
            testId: `wbs-menu-layout-${choice}`,
            run: () => setBranchLayout(id, choice),
            disabled: layout === choice,
          }))
        : [];
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
      ...(layoutCommands.length > 0 ? [layoutCommands] : []),
    ];
  })();

  const adding = ops.some((op) => op.kind === "add");
  const addItemCommand = { run: () => addItem(false), hidden: !canCreate, pending: adding };
  const addMilestoneCommand = {
    run: () => addItem(false, selId, true),
    hidden: !canCreate,
    pending: adding,
  };

  const toolbar = (
    <WbsToolbar
      addItem={addItemCommand}
      addSubItem={{
        run: () => addItem(true),
        hidden: !canCreate,
        disabled: !selected || selected.depth >= MAX_WBS_DEPTH || selected.item.isMilestone,
      }}
      addMilestone={addMilestoneCommand}
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
      undo={{
        run: undo,
        hidden: !canEdit,
        disabled: preview === null && !canUndo(undoStack, wbs),
      }}
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
      expandAll={{ run: () => changeFolds(() => new Set()), disabled: folds.size === 0 }}
      collapseAll={{
        run: () => changeFolds(() => new Set(parents.map((n) => n.item.id))),
        disabled: parents.length === 0,
      }}
      copyCsv={{ run: () => void copyCsv(), disabled: items.length === 0 }}
      fullscreen={
        fullscreen.supported
          ? { value: fullscreen.active, onChange: () => void fullscreen.toggle() }
          : null
      }
      people={
        view === "wbs"
          ? {
              value: chart.people,
              onChange: (people) => changeChart((current) => ({ ...current, people })),
            }
          : { value: display.assignees, onChange: (assignees) => changeDisplay({ assignees }) }
      }
      boxDetails={
        view === "wbs"
          ? {
              value: chart.details,
              onChange: (details) => changeChart((current) => ({ ...current, details })),
            }
          : null
      }
      milestones={
        view === "wbs"
          ? {
              value: chart.milestones,
              onChange: (milestones) => changeChart((current) => ({ ...current, milestones })),
            }
          : { value: display.milestones, onChange: (milestones) => changeDisplay({ milestones }) }
      }
      view={view}
      onView={changeView}
      scale={scale}
      onScale={changeScale}
      unmet={unmet}
      saving={saving}
      planNote={
        <PlanNote
          projectId={projectId}
          note={planNote.text}
          rowVer={planNote.rowVer}
          canEdit={canEdit}
        />
      }
      filter={
        view === "wbs" && items.length > 0 ? (
          <WbsFilterBar
            filter={filter}
            onChange={changeFilter}
            noMatch={filtered !== null && filtered.items.size === 0}
          />
        ) : null
      }
    />
  );

  return (
    <RequirementOwnersContext value={assigneeOptions}>
      <div
        ref={editorRef}
        data-testid="wbs-editor"
        className={`flex flex-col gap-3 ${
          fullscreen.active ? "fixed inset-0 z-(--z-fullscreen) overflow-auto bg-surface p-4" : ""
        }`}
        onKeyDown={undoKeys}
      >
        {toolbar}

        {items.length === 0 ? (
          <EmptyState
            title={messages.list.emptyTitle}
            body={W.emptyBody}
            action={
              canCreate ? (
                <Button onClick={() => addItem(false)} pending={adding}>
                  {W.addItem}
                </Button>
              ) : undefined
            }
          />
        ) : view === "wbs" ? (
          <WbsDiagram
            projectName={projectName}
            wbs={wbs}
            filtered={filtered}
            visible={visible}
            collapsed={folds}
            selectedId={selectedId}
            renamingId={renamingId}
            canEdit={canEdit}
            canDelete={canDelete}
            chart={chart}
            onChart={changeChart}
            on={diagramHandlers}
            requirementsHidden={searching ? NOTHING : cascade.hidden}
            addingRequirement={cascade.adding}
            addRequirementType={cascade.addType}
            requirementNeeds={needOptions}
            requirementAccess={cascade.access}
            onRequirement={cascade.handlers}
            statusColors={statusColors}
            people={chart.people}
            details={chart.details}
            milestones={chart.milestones ? milestoneChips : undefined}
          />
        ) : (
          <>
            <GanttBoard
              scrollRef={scrollRef}
              wbs={shown}
              links={links}
              timeline={timeline}
              today={today}
              display={display}
              progress={progress}
              milestones={milestoneChips}
              selectedId={selectedId}
              listingId={listingId}
              on={boardHandlers}
              tools={
                <GanttTools
                  addItem={addItemCommand}
                  addMilestone={addMilestoneCommand}
                  onCopySummary={() => void copySummary()}
                  display={display}
                  onDisplay={changeDisplay}
                />
              }
            />
            <StickyScrollbar targetRef={scrollRef} />
            {listed ? (
              <GanttRequirementsPanel
                key={listed.item.id}
                node={listed}
                adding={cascade.adding === listed.item.id}
                addType={cascade.addType}
                needs={needOptions}
                access={cascade.access}
                on={cascade.handlers}
                onClose={() => setListingId(null)}
              />
            ) : null}
          </>
        )}
        {/* A card selects on pointerdown, before focus leaves the panel: one panel per item keeps
            a field's typing on the item it was typed for. */}
        {selected ? (
          <WbsDetailsPanel
            key={selected.item.id}
            node={selected}
            canEdit={canEdit}
            canDone={statuses.some((s) => s.label === DONE_STATUS)}
            assigneeOptions={assigneeOptions}
            rolledBudget={budgets.get(selected.item.id) ?? null}
            subItems={
              view === "wbs" && selected.childIds.length > 0
                ? {
                    value: branchLayout(chart.branches, selected.item.id),
                    onChange: (layout) => setBranchLayout(selected.item.id, layout),
                  }
                : null
            }
            on={{
              rename: (name) => rename(selected.item.id, name),
              setStart: (value) => setStart(selected.item.id, value),
              setEnd: (value) => setEnd(selected.item.id, value),
              update: (patch) => updateDetails(selected.item.id, patch),
              note: (text) => setNote(selected.item.id, text),
              done: () => setStatus(selected.item.id, DONE_STATUS),
              close: () => setSelectedId(null),
            }}
          />
        ) : null}
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
    </RequirementOwnersContext>
  );
}
