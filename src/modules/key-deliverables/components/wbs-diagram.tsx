"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { OptionColor } from "@/lib/lookup-lists";
import { formatDate, toDateInput } from "@/lib/format";
import { messages } from "@/lib/messages";
import {
  descendantIds,
  dropPlacement,
  fitsUnder,
  type DropZone,
  type Placement,
  type Wbs,
  type WbsNode,
} from "../schemas/wbs";
import { shortDate } from "./gantt-scale";
import { DraftInput } from "./draft-input";
import { connectorSpan, dropZoneAt, edgeScroll, type DropAxis } from "./wbs-diagram-layout";

const W = messages.keyDeliverables.wbs;

/** The pixels a pointer must travel before a press on a box becomes a drag. */
const DRAG_SLOP = 4;

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
}

/** Top-level boxes: filled with the item's colour, as in the checklist's WBS. */
const LEVEL_ONE: Record<OptionColor, string> = {
  red: "border-2 border-tone-red-ink bg-tone-red-soft",
  orange: "border-2 border-tone-orange-ink bg-tone-orange-soft",
  yellow: "border-2 border-tone-yellow-ink bg-tone-yellow-soft",
  green: "border-2 border-tone-green-ink bg-tone-green-soft",
  blue: "border-2 border-tone-blue-ink bg-tone-blue-soft",
  purple: "border-2 border-tone-purple-ink bg-tone-purple-soft",
  gray: "border-2 border-tone-gray-ink bg-tone-gray-soft",
};

/** Boxes below the top level: the colour as a stripe on the left. */
const STRIPE: Record<OptionColor, string> = {
  red: "border-l-tone-red-ink",
  orange: "border-l-tone-orange-ink",
  yellow: "border-l-tone-yellow-ink",
  green: "border-l-tone-green-ink",
  blue: "border-l-tone-blue-ink",
  purple: "border-l-tone-purple-ink",
  gray: "border-l-tone-gray-ink",
};

/** Where the "drops here" line goes, by layout and zone. */
const DROP_LINE: Record<"row" | "column", Record<"before" | "after", string>> = {
  row: { before: "inset-y-0 -left-3.5 w-1", after: "inset-y-0 -right-3.5 w-1" },
  column: { before: "inset-x-0 -top-2 h-1", after: "inset-x-0 -bottom-2 h-1" },
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
 * project on top, the top-level items side by side under it, and each one's
 * sub-items stacked below it, indented a step per level and joined by lines.
 * Drag a box (or its grip, on a touch screen) onto another to make it a
 * sub-item, or onto an edge to put it in front of or behind it. Double-click
 * or Enter renames; clicking the dates of an item without sub-items edits
 * them; the arrow keys walk the tree. It is the same breakdown as the Gantt's
 * outline, so every change shows in both.
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
  on,
}: {
  projectName: string;
  wbs: Wbs;
  /** The ids on screen in breakdown order: the arrow keys walk them. */
  visible: number[];
  collapsed: ReadonlySet<number>;
  selectedId: number | null;
  renamingId: number | null;
  canEdit: boolean;
  canDelete: boolean;
  on: DiagramHandlers;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);

  // ---- the line from the project box to the top-level row -------------------

  const [bar, setBar] = useState<{ left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const row = rowRef.current;
    const root = rootRef.current;
    if (!row || !root) return;
    const measure = () => {
      const base = row.getBoundingClientRect().left;
      const own = root.getBoundingClientRect();
      const xs = [Math.round(own.left + own.width / 2 - base)];
      row.querySelectorAll<HTMLElement>("[data-wbs-stub]").forEach((stub) => {
        xs.push(Math.round(stub.getBoundingClientRect().left - base));
      });
      const next = connectorSpan(xs);
      setBar((current) =>
        current?.left === next?.left && current?.width === next?.width ? current : next,
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    observer.observe(root);
    return () => observer.disconnect();
  }, [wbs, collapsed, projectName]);

  // ---- keyboard --------------------------------------------------------------

  const tabbableId = selectedId !== null && visible.includes(selectedId) ? selectedId : visible[0];

  function focusBox(id: number | undefined) {
    if (id === undefined) return;
    on.select(id);
    boxElement(scrollRef.current, id)?.focus();
  }

  function onBoxKey(event: React.KeyboardEvent<HTMLElement>, node: WbsNode) {
    if (event.target !== event.currentTarget) return;
    const id = node.item.id;
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
        else if (parent) focusBox(node.childIds[0]);
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
    const zone = dropZoneAt(
      target.getBoundingClientRect(),
      x,
      y,
      (target.dataset.wbsAxis ?? "column") as DropAxis,
    );
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
    if (target.closest("input, button")) return;
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

  // ---- drawing ------------------------------------------------------------------

  const dragged = dragId !== null ? wbs.nodes.get(dragId) : undefined;
  const live = drop?.placement ? drop : null;

  function box(node: WbsNode, axis: "row" | "column") {
    const id = node.item.id;
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
        onDoubleClick={() => (canEdit ? on.renameStart(id) : on.open(id))}
        onToggle={() => on.toggle(id)}
        onRename={(name) => on.rename(id, name)}
        onRenameEnd={(refocus) => endRename(id, refocus)}
        onStart={(value) => on.setStart(id, value)}
        onEnd={(value) => on.setEnd(id, value)}
      />
    );
  }

  function branch(id: number): React.ReactNode {
    const node = wbs.nodes.get(id);
    if (!node || node.childIds.length === 0 || collapsed.has(id)) return null;
    const last = node.childIds.length - 1;
    return (
      <div role="none" className="ml-5 flex flex-col">
        {node.childIds.map((kid, i) => (
          <div key={kid} role="none" className="relative pt-3 pl-6">
            <span
              aria-hidden="true"
              className={`absolute top-0 left-0 w-px bg-ink-faint ${i === last ? "h-10" : "bottom-0"}`}
            />
            <span aria-hidden="true" className="absolute top-10 left-0 h-px w-6 bg-ink-faint" />
            {box(wbs.nodes.get(kid)!, "column")}
            {branch(kid)}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      data-testid="wbs-diagram"
      className={`relative max-h-[calc(100dvh-16rem)] min-h-64 overflow-auto rounded-lg border border-line bg-surface print:max-h-none print:overflow-visible print:border-0 ${
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
      <div className="flex w-max min-w-full flex-col items-center p-4 md:p-6">
        <div
          ref={rootRef}
          data-wbs-drop="root"
          data-wbs-axis="root"
          data-testid="wbs-root"
          className={`max-w-80 rounded-md bg-accent px-5 py-3 text-center text-sm font-semibold break-words text-on-accent outline-offset-4 ${
            live && live.target === null ? "outline-2 outline-focus outline-dashed" : ""
          }`}
        >
          {projectName}
        </div>
        <span aria-hidden="true" className="h-6 w-px bg-ink-faint" />
        <div
          ref={rowRef}
          role="tree"
          aria-label={W.diagramLabel}
          className="relative flex items-start gap-6"
        >
          {bar ? (
            <span
              aria-hidden="true"
              className="absolute top-0 h-px bg-ink-faint"
              style={{ left: bar.left, width: bar.width + 1 }}
            />
          ) : null}
          {wbs.rootIds.map((id) => (
            <div key={id} role="none" className="relative pt-6">
              <span
                aria-hidden="true"
                data-wbs-stub=""
                className="absolute top-0 left-[5.5rem] h-6 w-px bg-ink-faint"
              />
              {box(wbs.nodes.get(id)!, "row")}
              {branch(id)}
            </div>
          ))}
        </div>
      </div>

      {dragged ? (
        <div
          ref={ghostRef}
          aria-hidden="true"
          className={`pointer-events-none fixed top-0 left-0 z-50 max-w-56 rounded-md border bg-surface-raised px-2.5 py-1.5 text-sm text-ink shadow-lg ${
            live ? "border-focus" : "border-line opacity-80"
          }`}
        >
          <span className="mr-1.5 text-xs text-ink-muted tabular-nums">{dragged.code}</span>
          {dragged.item.name || messages.keyDeliverables.deliverableFallback(dragged.item.id)}
        </div>
      ) : null}
    </div>
  );
}

const dateField =
  "h-7 w-full min-w-0 rounded-sm border border-line bg-surface px-1 text-xs font-normal text-ink tabular-nums focus:border-focus focus:outline-none";

/** One box: grip, code, show/hide toggle, name (or its field while renaming) and dates. */
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
}: {
  node: WbsNode;
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
}) {
  const id = node.item.id;
  const parent = node.childIds.length > 0;
  const name = node.item.name || messages.keyDeliverables.deliverableFallback(id);
  const dated = node.start !== null && node.end !== null;
  const shownDates = dated ? W.dateRange(shortDate(node.start!), shortDate(node.end!)) : W.noDates;
  const spokenDates = dated
    ? W.dateRange(formatDate(node.start!), formatDate(node.end!))
    : W.noDates;
  const shape =
    node.depth === 1
      ? `font-semibold ${LEVEL_ONE[node.color]}`
      : `border border-line border-l-4 bg-surface ${STRIPE[node.color]}`;

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
      aria-label={W.boxLabel(node.code, name, spokenDates)}
      className={`relative flex min-h-14 w-44 flex-col gap-0.5 rounded-md px-2.5 py-1.5 text-left select-none focus-visible:outline-2 focus-visible:outline-focus print:break-inside-avoid ${shape} ${
        selected ? "ring-2 ring-accent-strong ring-offset-1 ring-offset-surface" : ""
      } ${zone === "into" ? "outline-2 outline-offset-4 outline-focus outline-dashed" : "outline-offset-2"} ${
        faded ? "opacity-40" : ""
      } ${canEdit && !renaming ? "cursor-grab" : ""}`}
      onPointerDown={onPointerDown}
      onFocus={(event) => {
        if (event.target === event.currentTarget) onFocus();
      }}
      onKeyDown={onKeyDown}
      onDoubleClick={onDoubleClick}
    >
      {zone === "before" || zone === "after" ? (
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute rounded-full bg-focus ${DROP_LINE[axis][zone]}`}
        />
      ) : null}
      <div className="flex min-h-6 items-center gap-1">
        {canEdit ? (
          <span
            aria-hidden="true"
            data-wbs-grip=""
            className="-ml-1.5 flex size-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-sm text-ink-muted hover:bg-surface-raised print:hidden"
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
        <span className="text-xs font-normal text-ink-muted tabular-nums">{node.code}</span>
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
            className="ml-auto flex h-6 min-w-6 cursor-pointer items-center justify-center rounded-sm px-1 text-xs font-medium text-ink-muted tabular-nums hover:bg-surface-raised print:hidden"
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
      </div>
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
          className="h-8 w-full min-w-0 rounded-sm border border-focus bg-surface px-1.5 text-sm font-normal text-ink select-text focus:outline-none"
        />
      ) : (
        <span className="text-sm break-words text-ink">{name}</span>
      )}
      {editingDates && datesEditable ? (
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
          <DraftInput
            type="date"
            aria-label={W.endOf(node.code)}
            value={toDateInput(node.end)}
            onCommit={onEnd}
            className={dateField}
          />
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
    </div>
  );
}
