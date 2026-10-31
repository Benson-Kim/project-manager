"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ResizeHandle } from "@/components/ui/data-view/datasheet-cells";
import { StickyScrollbar } from "@/components/ui/data-view/sticky-scrollbar";
import { planTone, TONES } from "@/components/ui/tones";
import type { OptionColor } from "@/lib/lookup-lists";
import { formatDate, toDateInput } from "@/lib/format";
import { messages } from "@/lib/messages";
import type { RequirementOption } from "@/modules/requirements/schemas/requirement";
import type { SolutionType } from "@/modules/requirements/schemas/requirement-types";
import {
  descendantIds,
  dropPlacement,
  fitsUnder,
  indentTarget,
  itemProgress,
  moveDownTarget,
  moveUpTarget,
  outdentTarget,
  planBudget,
  planProgress,
  rolledBudget,
  rolledEffort,
  type DropZone,
  type Placement,
  type Wbs,
  type WbsNode,
} from "../schemas/wbs";
import { shownWbs, type WbsShown } from "../schemas/wbs-filter";
import { stripOnlyIds, type MilestoneChip } from "../schemas/wbs-milestones";
import { DraftInput } from "./draft-input";
import { flipKey, useFlip } from "./use-flip";
import { usePrintFit } from "./use-print-fit";
import { BoxMeta, BoxTooltip, PlanMeta } from "./wbs-box-meta";
import { PrioritySelect } from "./priority-select";
import { BoxNote } from "./wbs-box-note";
import { MilestoneStrip } from "./wbs-milestone-strip";
import { isMenuKey, menuBelow, type MenuRequest } from "./wbs-context-menu";
import {
  AddRequirementButton,
  BoxRequirements,
  type RequirementAccess,
  type RequirementHandlers,
} from "./wbs-requirements";
import {
  ZOOM_STEPS,
  branchRows,
  chartPx,
  chartSize,
  chartVariables,
  chooseBranch,
  dropZoneAt,
  edgeScroll,
  fitZoom,
  zoomStep,
  type BranchLayout,
  type ChartSettings,
  type DropAxis,
} from "./wbs-diagram-layout";

const W = messages.keyDeliverables.wbs;

const CHART_VARIABLES = chartVariables();

/** Alt+arrow on a box: the toolbar's Move up, Move down, Indent and Outdent. */
const MOVE_KEYS: Partial<Record<string, (wbs: Wbs, id: number) => Placement | null>> = {
  ArrowUp: moveUpTarget,
  ArrowDown: moveDownTarget,
  ArrowRight: indentTarget,
  ArrowLeft: outdentTarget,
};

/**
 * Where the lines meet a box in its slot: the middle, except in a listed
 * branch's slot, which is wider on its right, where it is the box's centre.
 */
const LISTED_CENTRE = "left-[calc(var(--wbs-gap)+var(--wbs-box)/2)]";
const LISTED_FIRST = "right-0 left-[calc(var(--wbs-gap)+var(--wbs-box)/2)]";
const LISTED_LAST = "left-0 w-[calc(var(--wbs-gap)+var(--wbs-box)/2)]";

const MOVE_SHORTCUTS = Object.keys(MOVE_KEYS)
  .map((key) => `Alt+${key}`)
  .join(" ");

/** The pixels a pointer must travel before a press on a box becomes a drag. */
const DRAG_SLOP = 4;

/** A name click waits this long for a double-click (rename) before opening the menu. */
const NAME_CLICK_MS = 250;

/** What the diagram asks the editor to do. */
export interface DiagramHandlers {
  select: (id: number) => void;
  toggle: (id: number) => void;
  /** Open an item's name for typing; null closes it. */
  renameStart: (id: number | null) => void;
  rename: (id: number, name: string) => void;
  /** A date typed in a box: a new start keeps the length, a new end changes it. */
  setStart: (id: number, value: string) => void;
  setEnd: (id: number, value: string) => void;
  move: (id: number, placement: Placement) => void;
  open: (id: number) => void;
  remove: (id: number) => void;
  /** A drop the 10-level limit refuses. */
  tooDeep: () => void;
  /** Open the item's context menu (ADR-0036). */
  menu: (id: number, at: MenuRequest) => void;
  /** Save the item's note; resolves true once it is stored. */
  note: (id: number, text: string) => Promise<boolean>;
  /** Absent for viewers. */
  priority?: (id: number, priority: string | null) => void;
}

/** A name's size and weight by level: the top levels read as headings, deeper ones as entries. */
const LEVEL_TEXT = ["text-[15px] font-semibold", "text-sm font-semibold", "text-sm"] as const;

function nameText(depth: number): string {
  return LEVEL_TEXT[Math.min(depth, LEVEL_TEXT.length) - 1];
}

/** A box: its level's fill, or the item's own colour when it has one. */
function boxShape(node: WbsNode): string {
  return `border-2 ${planTone(node.depth, node.item.color)}`;
}

/** A small button on a box's coloured band, beside its title pill. */
const HEAD_BUTTON = "flex size-5 shrink-0 cursor-pointer items-center justify-center print:hidden";

/** Where the "drops here" line goes: in the gap before or after the box. */
const DROP_LINE: Record<"row" | "column", Record<"before" | "after", string>> = {
  row: {
    before: "inset-y-0 -left-[calc(var(--wbs-gap)+0.125rem)] w-1",
    after: "inset-y-0 -right-[calc(var(--wbs-gap)+0.125rem)] w-1",
  },
  column: {
    before: "inset-x-0 -top-[calc(var(--wbs-list-gap)/2+0.125rem)] h-1",
    after: "inset-x-0 -bottom-[calc(var(--wbs-list-gap)/2+0.125rem)] h-1",
  },
};

interface Press {
  pointerId: number;
  id: number;
  x0: number;
  y0: number;
  x: number;
  y: number;
  started: boolean;
}

interface Drop {
  /** Null is the project box. */
  target: number | null;
  zone: DropZone;
  placement: Placement | null;
}

function sameDrop(a: Drop | null, b: Drop | null): boolean {
  return (
    a === b ||
    (a !== null &&
      b !== null &&
      a.target === b.target &&
      a.zone === b.zone &&
      (a.placement === b.placement ||
        (a.placement !== null &&
          b.placement !== null &&
          a.placement.parentId === b.placement.parentId &&
          a.placement.position === b.placement.position)))
  );
}

function boxElement(root: HTMLElement | null, id: number): HTMLElement | null {
  return root?.querySelector<HTMLElement>(`[data-wbs-box="${id}"]`) ?? null;
}

/**
 * The work breakdown drawn as boxes (ADR-0027 §8, checklist row 67): the
 * project on top, the top-level items side by side under it, and below each
 * item its sub-items, side by side where the chart has room and listed under
 * it where it has not, so the chart fits its width instead of growing
 * sideways. The viewer can set a branch either way (its switch, or Sub-items
 * in the toolbar), zoom, and drag the chart's right edge to give it more or
 * less room; the settings are kept per project in their browser.
 * Drag a box (or its grip, on a touch screen) onto another to make it a
 * sub-item, or onto an edge to put it in front of or behind it. Alt+arrows
 * move the focused box like the toolbar. Double-click or Enter renames;
 * clicking the dates of an item without sub-items edits them; the arrow keys
 * walk the tree. It is the same breakdown as the Gantt's outline, so every
 * change shows in both.
 */
export function WbsDiagram({
  projectName,
  wbs,
  visible,
  collapsed,
  selectedId,
  renamingId,
  canEdit,
  canDelete,
  chart,
  onChart,
  on,
  requirementsHidden,
  addingRequirement,
  addRequirementType,
  requirementNeeds,
  requirementAccess,
  onRequirement,
  statusColors,
  people = false,
  details = false,
  filtered = null,
  milestones = [],
}: {
  projectName: string;
  wbs: Wbs;
  /**
   * Under a search or chips, what shows. Only the drawing leaves the rest out: moves, drops and
   * roll-ups still work on the whole breakdown, so hidden siblings keep their places.
   */
  filtered?: WbsShown | null;
  /** The ids on screen in breakdown order: the arrow keys walk them. */
  visible: number[];
  collapsed: ReadonlySet<number>;
  selectedId: number | null;
  renamingId: number | null;
  canEdit: boolean;
  canDelete: boolean;
  chart: ChartSettings;
  /** Changes the settings; `save: false` while the width is still being dragged. */
  onChart: (change: (current: ChartSettings) => ChartSettings, save?: boolean) => void;
  on: DiagramHandlers;
  /** Items whose requirements are folded away. */
  requirementsHidden: ReadonlySet<number>;
  /** The item whose add-requirement field is open. */
  addingRequirement: number | null;
  /** The kind that field is set to. */
  addRequirementType: SolutionType;
  /** What that field's "Meets" offers. */
  requirementNeeds: readonly RequirementOption[];
  requirementAccess: RequirementAccess;
  onRequirement: RequirementHandlers;
  statusColors: ReadonlyMap<string, OptionColor>;
  /** Show who is on each item under its name. */
  people?: boolean;
  /** The Details toggle: boxes show their dates, status and work. */
  details?: boolean;
  /** The milestone strip above the project box; empty hides it. */
  milestones?: readonly MilestoneChip[];
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  usePrintFit(scrollRef);
  const progress = useMemo(() => itemProgress(wbs), [wbs]);
  const budgets = useMemo(() => rolledBudget(wbs), [wbs]);
  const effort = useMemo(() => rolledEffort(wbs), [wbs]);
  const drawn = useMemo(() => {
    const stripOnly = stripOnlyIds(wbs, milestones);
    if (!filtered && stripOnly.size === 0) return wbs;
    const shown = filtered ? [...filtered.items] : [...wbs.nodes.keys()];
    return shownWbs(wbs, new Set(shown.filter((id) => !stripOnly.has(id))));
  }, [wbs, filtered, milestones]);
  const kids = (id: number) => drawn.nodes.get(id)?.childIds ?? [];
  const contentRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const placed = useMemo(() => flipKey(drawn, collapsed), [drawn, collapsed]);
  useFlip(contentRef, placed, chart.zoom);

  // ---- layout -------------------------------------------------------------------

  /** The view's size, the page's rem and the chart's padding; null until measured. */
  const [view, setView] = useState<{
    width: number;
    height: number;
    rem: number;
    /** Each side. */
    pad: number;
    /** Top and bottom together (the top leaves room for the zoom buttons). */
    padY: number;
  } | null>(null);
  useLayoutEffect(() => {
    const scroll = scrollRef.current;
    const content = contentRef.current;
    if (!scroll || !content) return;
    // A ResizeObserver reports as soon as it observes, then on every resize.
    const observer = new ResizeObserver(() => {
      const maxHeight = parseFloat(getComputedStyle(scroll).maxHeight);
      const style = getComputedStyle(content);
      const next = {
        width: scroll.clientWidth,
        height: Number.isFinite(maxHeight) ? maxHeight : scroll.clientHeight,
        rem: parseFloat(getComputedStyle(document.documentElement).fontSize),
        pad: parseFloat(style.paddingLeft),
        padY: parseFloat(style.paddingTop) + parseFloat(style.paddingBottom),
      };
      setView((current) =>
        current && (Object.keys(next) as (keyof typeof next)[]).every((k) => current[k] === next[k])
          ? current
          : next,
      );
    });
    observer.observe(scroll);
    return () => observer.disconnect();
  }, []);

  /** The width the chart lays itself out in, in screen pixels. */
  const frame = chart.width ?? view?.width ?? 0;
  const rows = useMemo(
    () =>
      view
        ? branchRows(
            drawn,
            collapsed,
            chart.branches,
            frame / chart.zoom - 2 * view.pad,
            chartPx(view.rem),
          )
        : new Set<number>(),
    [drawn, collapsed, chart.branches, chart.zoom, frame, view],
  );

  // A breakdown wider than the view opens on its middle, under the project box.
  const centred = useRef(false);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !view || centred.current) return;
    centred.current = true;
    el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
  }, [view]);

  function setBranch(id: number, layout: BranchLayout) {
    onChart((current) => ({
      ...current,
      branches: chooseBranch(wbs, current.branches, id, layout),
    }));
  }

  function zoomTo(zoom: number) {
    onChart((current) => ({ ...current, zoom }));
  }

  function fit() {
    const scroll = scrollRef.current;
    if (!view || !scroll) return;
    const zoom = chart.zoom;
    // Sizes on screen are zoomed; the layout works in the chart's own pixels.
    const unzoomed = (el: Element | null) => (el?.getBoundingClientRect().height ?? 0) / zoom;
    const boxes = [...scroll.querySelectorAll("[data-wbs-box]")];
    const px = chartPx(view.rem, Math.max(0, ...boxes.map(unzoomed)));
    const head = unzoomed(stripRef.current) + unzoomed(rootRef.current) + px.link;
    const best = fitZoom((step) => {
      const available = view.width / step - 2 * view.pad;
      const size = chartSize(
        drawn,
        collapsed,
        branchRows(drawn, collapsed, chart.branches, available, px),
        px,
      );
      return (
        (size.width + 2 * view.pad) * step <= view.width &&
        (head + size.height + view.padY) * step <= view.height
      );
    });
    if (best !== zoom || chart.width !== null) {
      onChart((current) => ({ ...current, width: null, zoom: best }));
    }
  }

  function resizeTo(width: number) {
    if (!view) return;
    const least = (chartPx(view.rem).slot + 2 * view.pad) * chart.zoom;
    onChart((current) => ({ ...current, width: Math.round(Math.max(width, least)) }), false);
  }

  function windowWidth() {
    onChart((current) => ({ ...current, width: null }));
  }

  // ---- keyboard --------------------------------------------------------------

  const tabbableId = selectedId !== null && visible.includes(selectedId) ? selectedId : visible[0];

  function focusBox(id: number | undefined) {
    if (id === undefined) return;
    on.select(id);
    boxElement(scrollRef.current, id)?.focus();
  }

  // A box moved with the keyboard is drawn anew under its new parent, and drawn again where the
  // server puts it; each time the focus falls back to the page, so it goes back to the box,
  // until the viewer moves the focus elsewhere themselves.
  const keyboardMoved = useRef<number | null>(null);
  useEffect(() => {
    const id = keyboardMoved.current;
    if (id === null) return;
    const el = boxElement(scrollRef.current, id);
    const active = document.activeElement;
    if (active && active !== document.body && active !== el) keyboardMoved.current = null;
    else if (el && active !== el) el.focus();
  });

  function onBoxKey(event: React.KeyboardEvent<HTMLElement>, node: WbsNode) {
    if (event.target !== event.currentTarget) return;
    const id = node.item.id;
    if (isMenuKey(event)) {
      event.preventDefault();
      on.menu(id, menuBelow(event.currentTarget));
      return;
    }
    const shortcut = event.altKey && canEdit ? MOVE_KEYS[event.key] : undefined;
    if (shortcut) {
      event.preventDefault();
      const target = shortcut(wbs, id);
      if (target) {
        keyboardMoved.current = id;
        on.move(id, target);
      } else if (event.key === "ArrowRight" && node.index > 0) {
        on.tooDeep();
      }
      return;
    }
    const at = visible.indexOf(id);
    const parent = node.childIds.length > 0;
    switch (event.key) {
      case "ArrowDown":
        focusBox(visible[at + 1]);
        break;
      case "ArrowUp":
        focusBox(visible[at - 1]);
        break;
      case "Home":
        focusBox(visible[0]);
        break;
      case "End":
        focusBox(visible[visible.length - 1]);
        break;
      case "ArrowRight":
        if (parent && collapsed.has(id)) on.toggle(id);
        else if (parent) focusBox(kids(id)[0]);
        break;
      case "ArrowLeft":
        if (parent && !collapsed.has(id)) on.toggle(id);
        else if (node.parentId !== null) focusBox(node.parentId);
        break;
      case "Enter":
      case "F2":
        if (canEdit) on.renameStart(id);
        else on.open(id);
        break;
      case "Delete":
        if (!canDelete) return;
        on.remove(id);
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  function endRename(id: number, refocus: boolean) {
    on.renameStart(null);
    if (refocus) requestAnimationFrame(() => boxElement(scrollRef.current, id)?.focus());
  }

  // ---- drag and drop ---------------------------------------------------------

  const press = useRef<Press | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const [drop, setDrop] = useState<Drop | null>(null);
  const dropRef = useRef<Drop | null>(null);
  const autoScroll = useRef({ x: 0, y: 0, frame: 0 });
  useEffect(() => {
    const state = autoScroll.current;
    return () => cancelAnimationFrame(state.frame);
  }, []);

  function showDrop(next: Drop | null) {
    if (sameDrop(dropRef.current, next)) return;
    dropRef.current = next;
    setDrop(next);
  }

  function hitTest(x: number, y: number) {
    const p = press.current;
    const target = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-wbs-drop]");
    if (!p || !target || !scrollRef.current?.contains(target)) {
      showDrop(null);
      return;
    }
    const raw = target.dataset.wbsDrop;
    const targetId = raw === "root" ? null : Number(raw);
    const axis = (target.dataset.wbsAxis ?? "row") as DropAxis;
    const zone = dropZoneAt(target.getBoundingClientRect(), x, y, axis);
    showDrop({ target: targetId, zone, placement: dropPlacement(wbs, p.id, targetId, zone) });
  }

  function placeGhost(x: number, y: number) {
    const ghost = ghostRef.current;
    if (ghost) ghost.style.transform = `translate(${x + 14}px, ${y + 10}px)`;
  }

  function scrollStep() {
    const el = scrollRef.current;
    const speed = autoScroll.current;
    const p = press.current;
    if (!el || !p?.started || (speed.x === 0 && speed.y === 0)) {
      speed.frame = 0;
      return;
    }
    el.scrollLeft += speed.x;
    el.scrollTop += speed.y;
    hitTest(p.x, p.y);
    speed.frame = requestAnimationFrame(scrollStep);
  }

  useLayoutEffect(() => {
    const p = press.current;
    if (dragId !== null && p) placeGhost(p.x, p.y);
  }, [dragId]);

  function endDrag() {
    press.current = null;
    cancelAnimationFrame(autoScroll.current.frame);
    autoScroll.current = { x: 0, y: 0, frame: 0 };
    setDragId(null);
    showDrop(null);
  }

  function onBoxPointerDown(event: React.PointerEvent<HTMLElement>, id: number) {
    on.select(id);
    if (!canEdit || event.button !== 0 || renamingId === id) return;
    const target = event.target as HTMLElement;
    if (target.closest("input, button, select")) return;
    // On a touch screen the box scrolls the diagram; only its grip drags.
    if (event.pointerType !== "mouse" && !target.closest("[data-wbs-grip]")) return;
    press.current = {
      pointerId: event.pointerId,
      id,
      x0: event.clientX,
      y0: event.clientY,
      x: event.clientX,
      y: event.clientY,
      started: false,
    };
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const p = press.current;
    if (!p || p.pointerId !== event.pointerId) return;
    p.x = event.clientX;
    p.y = event.clientY;
    if (!p.started) {
      if (Math.hypot(p.x - p.x0, p.y - p.y0) < DRAG_SLOP) return;
      p.started = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      setDragId(p.id);
    }
    placeGhost(p.x, p.y);
    hitTest(p.x, p.y);
    const box = event.currentTarget.getBoundingClientRect();
    const speed = autoScroll.current;
    speed.x = edgeScroll(p.x, box.left, box.right);
    speed.y = edgeScroll(p.y, box.top, box.bottom);
    if ((speed.x !== 0 || speed.y !== 0) && speed.frame === 0) {
      speed.frame = requestAnimationFrame(scrollStep);
    }
  }

  function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const p = press.current;
    if (!p || p.pointerId !== event.pointerId) return;
    const landed = dropRef.current;
    const started = p.started;
    // The click that follows a drag's release is not a click on a name.
    if (started) {
      justDragged.current = true;
      setTimeout(() => {
        justDragged.current = false;
      }, 0);
    }
    endDrag();
    if (!started || !landed) return;
    // A save that landed during the drag may have changed the tree since the last hit test.
    const placement = dropPlacement(wbs, p.id, landed.target, landed.zone);
    if (placement) {
      on.move(p.id, placement);
      return;
    }
    const branch = new Set([p.id, ...descendantIds(wbs, p.id)]);
    if (landed.target !== null && branch.has(landed.target)) return;
    const parentId =
      landed.zone === "into" || landed.target === null
        ? landed.target
        : (wbs.nodes.get(landed.target)?.parentId ?? null);
    if (!fitsUnder(wbs, p.id, parentId)) on.tooDeep();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Escape" || !press.current?.started) return;
    event.preventDefault();
    endDrag();
  }

  // ---- the context menu ---------------------------------------------------------

  const justDragged = useRef(false);
  const nameClick = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(nameClick.current), []);

  /** Opens the menu unless a double-click follows or the focus moved on. */
  function onNameClick(event: React.MouseEvent<HTMLElement>, id: number) {
    if (justDragged.current || event.detail > 1) {
      clearTimeout(nameClick.current);
      return;
    }
    const at = { x: event.clientX, y: event.clientY + 8, status: false };
    clearTimeout(nameClick.current);
    nameClick.current = setTimeout(() => {
      const box = boxElement(scrollRef.current, id);
      if (box?.contains(document.activeElement)) on.menu(id, { ...at, returnFocus: box });
    }, NAME_CLICK_MS);
  }

  function onBoxContextMenu(event: React.MouseEvent<HTMLElement>, id: number) {
    const target = event.target as HTMLElement;
    if (target.closest("input")) return;
    event.preventDefault();
    clearTimeout(nameClick.current);
    on.select(id);
    on.menu(id, {
      x: event.clientX,
      y: event.clientY,
      status: false,
      returnFocus: boxElement(scrollRef.current, id),
    });
  }

  // ---- drawing ------------------------------------------------------------------

  const dragged = dragId !== null ? wbs.nodes.get(dragId) : undefined;
  const live = drop?.placement ? drop : null;

  function box(node: WbsNode, axis: "row" | "column") {
    const id = node.item.id;
    // Only a branch among side-by-side boxes can spread its own sub-items; a listed one lists them.
    const spread = axis === "row" && rows.has(id);
    return (
      <ItemBox
        node={node}
        axis={axis}
        selected={id === selectedId}
        tabbable={id === tabbableId}
        collapsed={collapsed.has(id)}
        renaming={id === renamingId}
        canEdit={canEdit}
        faded={dragId === id}
        zone={live && live.target === id ? live.zone : null}
        onPointerDown={(event) => onBoxPointerDown(event, id)}
        onFocus={() => on.select(id)}
        onKeyDown={(event) => onBoxKey(event, node)}
        onDoubleClick={() => {
          clearTimeout(nameClick.current);
          if (canEdit) on.renameStart(id);
          else on.open(id);
        }}
        onContextMenu={(event) => onBoxContextMenu(event, id)}
        onNameClick={(event) => onNameClick(event, id)}
        onStatusClick={(el) => {
          on.select(id);
          on.menu(id, menuBelow(el, true));
        }}
        statusColor={node.item.status ? (statusColors.get(node.item.status) ?? null) : null}
        onPriority={on.priority ? (priority) => on.priority!(id, priority) : undefined}
        note={
          <BoxNote
            id={id}
            code={node.code}
            note={node.item.note}
            offerAdd={false}
            canEdit={canEdit}
            tabbable={id === tabbableId}
            onSave={(text) => on.note(id, text)}
          />
        }
        tooltip={
          <BoxTooltip
            id={id}
            title={`${node.code} ${node.item.name || messages.keyDeliverables.deliverableFallback(id)}`}
            start={node.start}
            end={node.end}
            milestone={node.item.isMilestone}
            priority={node.item.priority}
            progress={progress.get(id) ?? 0}
            owners={node.item.assignees.map((a) => a.name)}
          />
        }
        addRequirement={
          requirementAccess.canCreate ? (
            <AddRequirementButton
              node={node}
              on={onRequirement}
              tabIndex={id === tabbableId ? 0 : -1}
              className={`${HEAD_BUTTON} rounded-full bg-surface text-ink ${
                id === selectedId || addingRequirement === id
                  ? ""
                  : "opacity-0 group-hover/box:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
              }`}
            >
              <svg viewBox="0 0 16 16" aria-hidden="true" className="size-3" fill="none">
                <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" />
              </svg>
            </AddRequirementButton>
          ) : null
        }
        branch={
          shows(node) ? (
            <BranchSwitch
              node={node}
              row={spread}
              onSwitch={() => setBranch(id, spread ? "list" : "row")}
            />
          ) : null
        }
        details={details}
        meta={
          details || people ? (
            <BoxMeta
              id={id}
              name={node.item.name || messages.keyDeliverables.deliverableFallback(id)}
              owners={node.item.assignees.map((a) => a.name)}
              people={people}
              work={details}
              progress={progress.get(id) ?? 0}
              budget={budgets.get(id) ?? null}
              effort={effort.get(id) ?? null}
            />
          ) : null
        }
        requirements={
          <BoxRequirements
            node={node}
            hidden={requirementsHidden.has(id)}
            only={filtered?.requirements.get(id)}
            adding={addingRequirement === id}
            addType={addRequirementType}
            needs={requirementNeeds}
            access={requirementAccess}
            on={onRequirement}
            addButton={false}
          />
        }
        onToggle={() => on.toggle(id)}
        onRename={(name) => on.rename(id, name)}
        onRenameEnd={(refocus) => endRename(id, refocus)}
        onStart={(value) => on.setStart(id, value)}
        onEnd={(value) => on.setEnd(id, value)}
      />
    );
  }

  const shows = (node: WbsNode) => kids(node.item.id).length > 0 && !collapsed.has(node.item.id);

  /**
   * A box among its siblings side by side, with its sub-items under it. It
   * hangs from a stub off the line that joins its siblings; the line runs
   * between the first and last siblings' boxes, so it spans the gaps but stops
   * at the ends. A listed branch's slot is wider on its right (its list steps
   * in), so there the lines meet the box rather than the slot's middle.
   */
  function slot(id: number, i: number, last: number): React.ReactNode {
    const node = wbs.nodes.get(id)!;
    const row = shows(node) && rows.has(id);
    const listed = shows(node) && !row;
    const line =
      i === 0
        ? listed
          ? LISTED_FIRST
          : "right-0 left-1/2"
        : i === last
          ? listed
            ? LISTED_LAST
            : "right-1/2 left-0"
          : "inset-x-0";
    return (
      <div
        key={id}
        role="none"
        className={`relative flex flex-col pt-(--wbs-link) ${row ? "items-center" : "items-start px-(--wbs-gap)"}`}
      >
        {last > 0 ? (
          <span aria-hidden="true" className={`absolute top-0 h-px bg-ink-faint ${line}`} />
        ) : null}
        <span
          aria-hidden="true"
          className={`absolute top-0 h-(--wbs-link) w-px bg-ink-faint ${listed ? LISTED_CENTRE : "left-1/2"}`}
        />
        {box(node, "row")}
        {row ? (
          <>
            <span aria-hidden="true" className="h-(--wbs-link) w-px bg-ink-faint" />
            <div role="none" className="flex items-start">
              {kids(id).map((kid, k, all) => slot(kid, k, all.length - 1))}
            </div>
          </>
        ) : listed ? (
          list(node)
        ) : null}
      </div>
    );
  }

  /** A parent's sub-items listed under it on a rail, a step in per level. */
  function list(parent: WbsNode): React.ReactNode {
    const children = kids(parent.item.id);
    const last = children.length - 1;
    return (
      <div role="none" className="relative ml-(--wbs-rail) pt-(--wbs-link)">
        <span
          aria-hidden="true"
          className="absolute top-0 left-0 h-(--wbs-link) w-px bg-ink-faint"
        />
        {children.map((id, i) => {
          const node = wbs.nodes.get(id)!;
          return (
            <div key={id} role="none" className="relative pt-(--wbs-list-gap) pl-(--wbs-tick)">
              <span
                aria-hidden="true"
                className={`absolute top-0 left-0 w-px bg-ink-faint ${i === last ? "h-(--wbs-tick-y)" : "bottom-0"}`}
              />
              <span
                aria-hidden="true"
                className="absolute top-(--wbs-tick-y) left-0 h-px w-(--wbs-tick) bg-ink-faint"
              />
              {box(node, "column")}
              {shows(node) ? list(node) : null}
            </div>
          );
        })}
      </div>
    );
  }

  const percent = Math.round(chart.zoom * 100);
  const zoomButton =
    "min-h-8 min-w-8 cursor-pointer px-2 text-sm font-medium text-ink-muted tabular-nums first:rounded-l-md last:rounded-r-md hover:bg-surface-raised hover:text-ink disabled:cursor-default disabled:opacity-50";

  return (
    <div className="relative" style={CHART_VARIABLES}>
      <div
        role="group"
        aria-label={W.zoom}
        className="absolute top-2 right-4 z-10 flex divide-x divide-line rounded-md border border-line bg-surface shadow-sm print:hidden"
      >
        <button
          type="button"
          aria-label={W.zoomOut}
          data-testid="wbs-zoom-out"
          disabled={chart.zoom <= ZOOM_STEPS[0]}
          onClick={() => zoomTo(zoomStep(chart.zoom, -1))}
          className={zoomButton}
        >
          −
        </button>
        <button
          type="button"
          aria-label={W.actualSize(percent)}
          data-testid="wbs-zoom-reset"
          onClick={() => zoomTo(1)}
          className={zoomButton}
        >
          {percent}%
        </button>
        <button
          type="button"
          aria-label={W.zoomIn}
          data-testid="wbs-zoom-in"
          disabled={chart.zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]}
          onClick={() => zoomTo(zoomStep(chart.zoom, 1))}
          className={zoomButton}
        >
          +
        </button>
        <button
          type="button"
          aria-label={W.fitLabel}
          data-testid="wbs-zoom-fit"
          onClick={fit}
          className={zoomButton}
        >
          {W.fit}
        </button>
        {chart.width !== null ? (
          <button
            type="button"
            aria-label={W.windowWidthLabel}
            data-testid="wbs-window-width"
            onClick={windowWidth}
            className={zoomButton}
          >
            {W.windowWidth}
          </button>
        ) : null}
      </div>

      <div className="flow-root overflow-clip rounded-lg border border-line bg-surface print:overflow-visible print:border-0">
        <div
          ref={scrollRef}
          data-testid="wbs-diagram"
          data-print-fit=""
          className={`relative mb-[calc(var(--hbar,0px)*-1)] min-h-90 overflow-x-auto overflow-y-hidden print:mb-0 print:max-h-none print:overflow-visible ${
            dragged ? "cursor-grabbing" : ""
          }`}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={endDrag}
          onLostPointerCapture={() => {
            if (press.current?.started) endDrag();
          }}
          onKeyDown={onKeyDown}
        >
          <div
            ref={contentRef}
            className="relative flex w-max flex-col items-center p-4 pt-14 md:p-6 md:pt-14"
            style={{ zoom: chart.zoom, minWidth: frame ? frame / chart.zoom : "100%" }}
          >
            <div ref={stripRef} className="flex justify-center">
              <MilestoneStrip chips={milestones} selectedId={selectedId} onSelect={on.select} />
            </div>
            <div
              ref={rootRef}
              data-wbs-drop="root"
              data-wbs-axis="root"
              data-testid="wbs-root"
              className={`max-w-96 rounded-lg bg-ink px-8 py-3 text-center text-lg font-bold break-words text-surface outline-offset-4 print:[print-color-adjust:exact] ${
                live && live.target === null ? "outline-[3px] outline-coral outline-dashed" : ""
              }`}
            >
              {projectName}
              <PlanMeta progress={planProgress(wbs, progress)} budget={planBudget(wbs, budgets)} />
            </div>
            {drawn.rootIds.length > 0 ? (
              <span aria-hidden="true" className="h-(--wbs-link) w-px bg-ink-faint" />
            ) : null}
            <div role="tree" aria-label={W.diagramLabel} className="flex items-start">
              {drawn.rootIds.map((id, i) => slot(id, i, drawn.rootIds.length - 1))}
            </div>
            {view ? (
              <div
                className="absolute inset-y-0 right-0 flex print:hidden"
                title={W.chartWidthHint}
                onDoubleClick={windowWidth}
              >
                <ResizeHandle
                  label={W.chartWidth}
                  orientation="vertical"
                  value={chart.width ?? undefined}
                  estimate={view.width}
                  onResize={resizeTo}
                  onCommit={() => onChart((current) => current)}
                  measure={() => contentRef.current?.getBoundingClientRect().width ?? 0}
                  className="h-full w-2 cursor-col-resize border-r-2 border-line"
                />
              </div>
            ) : null}
          </div>

          {dragged ? (
            <div
              ref={ghostRef}
              aria-hidden="true"
              className={`pointer-events-none fixed top-0 left-0 z-50 max-w-(--wbs-box) rounded-md border bg-surface-raised px-2.5 py-1.5 text-sm text-ink shadow-lg ${
                live ? "border-focus" : "border-line opacity-80"
              }`}
            >
              <span className="mr-1.5 text-xs text-ink-muted tabular-nums">{dragged.code}</span>
              {dragged.item.name || messages.keyDeliverables.deliverableFallback(dragged.item.id)}
            </div>
          ) : null}
        </div>
      </div>
      <StickyScrollbar targetRef={scrollRef} />
    </div>
  );
}

/**
 * ⇄ in a parent's head row: switches its sub-items between side by side (lit) and
 * listed. The toolbar's Sub-items does the same for the keyboard and screen
 * readers, and can give the choice back to the chart's width.
 */
function BranchSwitch({
  node,
  row,
  onSwitch,
}: {
  node: WbsNode;
  /** Its sub-items are side by side now. */
  row: boolean;
  onSwitch: () => void;
}) {
  const name = node.item.name || messages.keyDeliverables.deliverableFallback(node.item.id);
  return (
    <button
      type="button"
      tabIndex={-1}
      title={row ? W.listThem(name) : W.spreadThem(name)}
      data-testid={`wbs-branch-${node.item.id}`}
      onClick={(event) => {
        event.stopPropagation();
        onSwitch();
      }}
      onDoubleClick={(event) => event.stopPropagation()}
      className={`${HEAD_BUTTON} rounded-sm hover:bg-current/15 hover:opacity-100 ${
        row ? "bg-current/15" : "opacity-55"
      }`}
    >
      <svg
        viewBox="0 0 16 16"
        aria-hidden="true"
        className="size-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M2.5 5h10M10.5 2.5 13 5l-2.5 2.5M13.5 11h-10M5.5 8.5 3 11l2.5 2.5" />
      </svg>
    </button>
  );
}

const dateField =
  "h-7 w-full min-w-0 rounded-sm border border-line bg-surface px-1 text-xs font-normal text-ink tabular-nums focus:border-focus focus:outline-none";

/**
 * One box: a coloured band whose head row holds the grip, the show/hide toggle, a white pill with
 * the code and name (or its field while renaming), "+", ⇄ and the paperclip; then the dates.
 */
function ItemBox({
  node,
  axis,
  selected,
  tabbable,
  collapsed,
  renaming,
  canEdit,
  faded,
  zone,
  onPointerDown,
  onFocus,
  onKeyDown,
  onDoubleClick,
  onToggle,
  onRename,
  onRenameEnd,
  onStart,
  onEnd,
  onContextMenu,
  onNameClick,
  onStatusClick,
  statusColor,
  onPriority,
  details,
  addRequirement,
  branch,
  note,
  tooltip,
  meta,
  requirements,
}: {
  node: WbsNode;
  /** Side by side with its siblings, or listed under its parent. */
  axis: "row" | "column";
  selected: boolean;
  tabbable: boolean;
  collapsed: boolean;
  renaming: boolean;
  canEdit: boolean;
  /** It is the box being dragged. */
  faded: boolean;
  /** Where a dragged box would land against this one. */
  zone: DropZone | null;
  onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
  onFocus: () => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void;
  onDoubleClick: () => void;
  onToggle: () => void;
  onRename: (name: string) => void;
  onRenameEnd: (refocus: boolean) => void;
  onStart: (value: string) => void;
  onEnd: (value: string) => void;
  onContextMenu: (event: React.MouseEvent<HTMLElement>) => void;
  onNameClick: (event: React.MouseEvent<HTMLElement>) => void;
  onStatusClick: (chip: HTMLElement) => void;
  statusColor: OptionColor | null;
  /** Absent for viewers, who read the priority. */
  onPriority?: (priority: string | null) => void;
  /** Show the dates, status and priority; off, the box is just its code and name. */
  details: boolean;
  /** The "+" that opens the add-requirement field. */
  addRequirement: React.ReactNode;
  /** The ⇄ of a parent whose sub-items show. */
  branch: React.ReactNode;
  /** The paperclip. */
  note: React.ReactNode;
  /** The facts bubble over the name. */
  tooltip: React.ReactNode;
  /** Owners, Work %, budget and effort. */
  meta: React.ReactNode;
  requirements: React.ReactNode;
}) {
  const id = node.item.id;
  const parent = node.childIds.length > 0;
  const name = node.item.name || messages.keyDeliverables.deliverableFallback(id);
  const dated = node.start !== null && node.end !== null;
  // A milestone is one day, so it reads as a date rather than a range (ADR-0046).
  const milestone = node.item.isMilestone;
  const shownDates = !dated
    ? W.noDates
    : milestone
      ? formatDate(node.start!)
      : W.dateRange(formatDate(node.start!), formatDate(node.end!));
  const spokenDates = dated && milestone ? W.milestoneDate(shownDates) : shownDates;

  // The field can report the same name twice (Enter, then the blur as it closes);
  // Escape drops whatever was typed.
  const [editingDates, setEditingDates] = useState(false);
  // A parent's dates roll up from its sub-items, so only an item without sub-items takes typed dates.
  const datesEditable = canEdit && !parent;

  const sent = useRef<string | null>(null);
  const cancelled = useRef(false);
  useEffect(() => {
    if (!renaming) return;
    sent.current = null;
    cancelled.current = false;
  }, [renaming]);

  return (
    <div
      role="treeitem"
      data-wbs-box={id}
      data-wbs-drop={id}
      data-wbs-axis={axis}
      data-testid={`wbs-box-${id}`}
      tabIndex={tabbable ? 0 : -1}
      aria-level={node.depth}
      aria-setsize={node.siblingCount}
      aria-posinset={node.index + 1}
      aria-expanded={parent ? !collapsed : undefined}
      aria-selected={selected}
      aria-label={W.boxLabel(node.code, name, spokenDates, node.item.assigneeNames)}
      aria-keyshortcuts={canEdit ? MOVE_SHORTCUTS : undefined}
      className={`group/box relative flex min-h-(--wbs-box-min) w-(--wbs-box) flex-col gap-0.5 rounded-lg px-2.5 py-1.5 text-left select-none focus-visible:outline-2 focus-visible:outline-focus print:break-inside-avoid print:[print-color-adjust:exact] ${boxShape(node)} ${
        selected ? "ring-[3px] ring-coral ring-offset-1 ring-offset-surface" : ""
      } ${zone === "into" ? "outline-[3px] outline-offset-4 outline-coral outline-dashed" : "outline-offset-2"} ${
        faded ? "opacity-40" : ""
      } ${canEdit && !renaming ? "cursor-grab" : ""}`}
      onPointerDown={onPointerDown}
      onFocus={(event) => {
        if (event.target === event.currentTarget) onFocus();
      }}
      onKeyDown={onKeyDown}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
    >
      {zone === "before" || zone === "after" ? (
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute rounded-full bg-coral ${DROP_LINE[axis][zone]}`}
        />
      ) : null}
      <div className="group/head relative flex min-h-6 items-center gap-1">
        {tooltip}
        {canEdit ? (
          <span
            aria-hidden="true"
            data-wbs-grip=""
            className="-my-0.5 -ml-1 flex h-6 w-4 shrink-0 cursor-grab touch-none items-center justify-center rounded-sm opacity-45 hover:bg-current/15 print:hidden"
          >
            <svg viewBox="0 0 16 16" className="size-3.5" fill="currentColor">
              <circle cx="6" cy="3.5" r="1.25" />
              <circle cx="10" cy="3.5" r="1.25" />
              <circle cx="6" cy="8" r="1.25" />
              <circle cx="10" cy="8" r="1.25" />
              <circle cx="6" cy="12.5" r="1.25" />
              <circle cx="10" cy="12.5" r="1.25" />
            </svg>
          </span>
        ) : null}
        {parent ? (
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            data-wbs-toggle=""
            data-testid={`wbs-toggle-${id}`}
            onClick={(event) => {
              event.stopPropagation();
              onToggle();
            }}
            onDoubleClick={(event) => event.stopPropagation()}
            className="-my-0.5 flex h-6 min-w-5 shrink-0 cursor-pointer items-center justify-center rounded-sm px-0.5 text-xs font-medium tabular-nums hover:bg-current/15 print:hidden"
          >
            {collapsed ? (
              W.moreCount(node.childIds.length)
            ) : (
              <svg viewBox="0 0 16 16" className="size-3.5" fill="currentColor">
                <path d="M3 10.5l5-5 5 5z" />
              </svg>
            )}
          </button>
        ) : null}
        <div className="flex min-w-0 flex-1 items-start gap-1.5 rounded-lg bg-surface p-2 text-ink">
          {milestone ? (
            <span
              aria-hidden="true"
              data-testid={`wbs-milestone-${id}`}
              className="mt-1.5 size-2.5 shrink-0 rotate-45 rounded-xs bg-ink-muted"
            />
          ) : null}
          <span className="shrink-0 pt-0.5 text-xs font-normal text-ink-muted tabular-nums">
            {node.code}
          </span>
          {renaming ? (
            <DraftInput
              autoFocus
              data-wbs-name={id}
              aria-label={W.nameOf(node.code)}
              value={node.item.name}
              maxLength={4000}
              onFocus={(event) => event.currentTarget.select()}
              onKeyDown={(event) => {
                if (event.key !== "Escape") return;
                event.preventDefault();
                cancelled.current = true;
                onRenameEnd(true);
              }}
              onCommit={(next) => {
                if (cancelled.current || sent.current === next) return;
                sent.current = next;
                onRename(next);
              }}
              onSettle={() => onRenameEnd(true)}
              onBlur={() => onRenameEnd(false)}
              className="h-7 min-w-0 flex-1 rounded-sm border border-focus bg-surface px-1.5 text-sm font-normal text-ink select-text focus:outline-none"
            />
          ) : (
            <span
              data-testid={`wbs-name-${id}`}
              onClick={onNameClick}
              className={`line-clamp-2 min-w-0 flex-1 cursor-pointer leading-5 break-words text-ink ${nameText(node.depth)}`}
            >
              {name}
            </span>
          )}
        </div>
        {addRequirement}
        {branch}
        {note}
      </div>
      {!details ? null : editingDates && datesEditable ? (
        <div
          className="flex flex-col gap-1 pt-0.5"
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              setEditingDates(false);
            }
          }}
          onKeyDown={(event) => {
            if (event.key !== "Escape" || event.defaultPrevented) return;
            event.preventDefault();
            event.currentTarget.closest<HTMLElement>("[role=treeitem]")?.focus();
          }}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          <DraftInput
            autoFocus
            type="date"
            aria-label={W.startOf(node.code)}
            value={toDateInput(node.start)}
            onCommit={onStart}
            className={dateField}
          />
          {milestone ? null : (
            <DraftInput
              type="date"
              aria-label={W.endOf(node.code)}
              value={toDateInput(node.end)}
              onCommit={onEnd}
              className={dateField}
            />
          )}
        </div>
      ) : datesEditable ? (
        <button
          type="button"
          tabIndex={tabbable ? 0 : -1}
          data-testid={`wbs-dates-${id}`}
          aria-label={W.changeDates(node.code, spokenDates)}
          onClick={() => setEditingDates(true)}
          onDoubleClick={(event) => event.stopPropagation()}
          className="-mx-1 cursor-pointer self-start rounded-sm px-1 text-left text-xs font-normal text-ink-muted tabular-nums hover:bg-surface-raised hover:text-ink"
        >
          {shownDates}
        </button>
      ) : (
        <span className="text-xs font-normal text-ink-muted tabular-nums">{shownDates}</span>
      )}
      {details ? (
        <div className="flex flex-wrap items-center gap-1">
          {node.item.status || canEdit ? (
            <button
              type="button"
              tabIndex={tabbable ? 0 : -1}
              data-testid={`wbs-status-chip-${id}`}
              aria-haspopup="menu"
              aria-label={W.statusOf(node.code, node.item.status ?? W.noStatus)}
              onClick={(event) => {
                event.stopPropagation();
                onStatusClick(event.currentTarget);
              }}
              onDoubleClick={(event) => event.stopPropagation()}
              className={`inline-flex min-h-6 max-w-full cursor-pointer items-center gap-1.5 self-start rounded-full border px-2 text-xs font-medium ${
                statusColor ? TONES[statusColor].badge : "border-line bg-surface text-ink-muted"
              } ${canEdit ? "hover:border-focus" : "cursor-default"} print:border-0 print:px-0`}
            >
              <span className="truncate">{node.item.status ?? W.noStatus}</span>
            </button>
          ) : null}
          {onPriority ? (
            <PrioritySelect
              name={name}
              value={node.item.priority}
              onChange={onPriority}
              testId={`wbs-priority-${id}`}
              tabIndex={tabbable ? 0 : -1}
            />
          ) : node.item.priority ? (
            <span className="text-xs text-ink-muted">{node.item.priority}</span>
          ) : null}
        </div>
      ) : null}
      {meta}
      {requirements}
    </div>
  );
}
