import type { OptionColor } from "@/lib/lookup-lists";
import type { SolutionType } from "@/modules/requirements/schemas/requirement-types";
import type { AssigneeEntry } from "./key-deliverable";

/**
 * The work breakdown (ADR-0027): a project's key deliverables as a tree that
 * draws the Gantt. Pure functions over the rows usp_KeyDeliverable_GanttData
 * returns, so the editor can show a change before the server confirms it. They
 * mirror the procs: numbering by place among siblings, parent dates rolled up
 * from the items at the bottom of the branch, and the 10-level limit.
 * Items carry their requirements, and their colour follows their status (ADR-0036).
 */

/** Must equal @MaxDepth in dbo.usp_KeyDeliverable_AssertPlacement. */
export const MAX_WBS_DEPTH = 10;

/** The colour of an item whose status has none (no status, or an uncoloured one). */
export const NO_STATUS_COLOR: OptionColor = "gray";

/** Status label → colour. */
export type StatusColors = ReadonlyMap<string, OptionColor>;

/** Days a new item spans when nothing suggests better. */
export const NEW_ITEM_DAYS = 7;

const DAY_MS = 86_400_000;

/** A requirement allocated to an item (ADR-0037). The met tick and wording are shared across every
 *  deliverable it sits on; the order and the allocation's RowVer (placeRowVer) are per deliverable. */
export interface WbsRequirement {
  id: number;
  /** Only a solution is ever allocated to a deliverable (ADR-0037). */
  type: SolutionType;
  /** "FR-1.2", the register's own reference, from the server (ADR-0048); "" until it has one. */
  ref: string;
  text: string;
  isMet: boolean;
  sortOrder: number;
  /** The requirement's RowVer — edits and the met tick save against it. */
  rowVer: number;
  /** The allocation's RowVer — move and remove save against it. */
  placeRowVer: number;
}

export interface WbsItem {
  id: number;
  parentId: number | null;
  sortOrder: number;
  name: string;
  requestedDate: Date | null;
  /** Date only, at UTC midnight; a parent's is rolled up by the procs. */
  start: Date | null;
  /** The deadline: the last day of the bar, included. */
  end: Date | null;
  status: string | null;
  priority: string | null;
  /** Legacy stored colour; not drawn. */
  color: OptionColor | null;
  /** A date rather than a span (ADR-0046): start and end are the same day, and it has no sub-items. */
  isMilestone: boolean;
  assigneeNames: string | null;
  assignees: AssigneeEntry[];
  requirements: WbsRequirement[];
  rowVer: number;
}

export interface WbsNode {
  item: WbsItem;
  /** "1.2.3": the place among live siblings at each level. */
  code: string;
  /** 1 for a top-level item. */
  depth: number;
  parentId: number | null;
  childIds: number[];
  /** Place among its siblings, from 0. */
  index: number;
  siblingCount: number;
  /** Rolled up from the branch for a parent; the item's own for a leaf. */
  start: Date | null;
  end: Date | null;
  /** Its status's colour, else NO_STATUS_COLOR. */
  color: OptionColor;
  /** Levels in its branch: 1 for an item without sub-items. */
  height: number;
}

export interface Wbs {
  nodes: Map<number, WbsNode>;
  rootIds: number[];
  /** Every id, depth first, in breakdown order. */
  order: number[];
}

/** Where an item goes: under parentId (null = top level), at position from 1. */
export interface Placement {
  parentId: number | null;
  position: number;
}

export function utcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** Today on the viewer's calendar, as a UTC-midnight date like every stored date. */
export function todayUtc(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

export function addDays(date: Date, days: number): Date {
  return new Date(utcDay(date).getTime() + days * DAY_MS);
}

/** Whole days from one date to another (negative when `to` is earlier). */
export function dayDiff(from: Date, to: Date): number {
  return Math.round((utcDay(to).getTime() - utcDay(from).getTime()) / DAY_MS);
}

/** Days a bar covers, both ends included. */
export function durationDays(start: Date, end: Date): number {
  return dayDiff(start, end) + 1;
}

function minDate(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a.getTime() <= b.getTime() ? a : b;
}

function maxDate(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a.getTime() >= b.getTime() ? a : b;
}

function bySortOrder(a: WbsItem, b: WbsItem): number {
  return a.sortOrder - b.sortOrder || a.id - b.id;
}

export function statusColor(status: string | null, colors: StatusColors): OptionColor {
  return (status !== null ? colors.get(status) : undefined) ?? NO_STATUS_COLOR;
}

export function buildWbs(items: readonly WbsItem[], colors: StatusColors = new Map()): Wbs {
  const ids = new Set(items.map((i) => i.id));
  const childrenOf = new Map<number | null, WbsItem[]>();
  for (const item of items) {
    const parent = item.parentId !== null && ids.has(item.parentId) ? item.parentId : null;
    const list = childrenOf.get(parent);
    if (list) list.push(item);
    else childrenOf.set(parent, [item]);
  }
  for (const list of childrenOf.values()) list.sort(bySortOrder);

  const nodes = new Map<number, WbsNode>();
  const order: number[] = [];

  function visit(
    item: WbsItem,
    depth: number,
    code: string,
    parentId: number | null,
    index: number,
    siblingCount: number,
  ): { leafStart: Date | null; leafEnd: Date | null } {
    const kids = (childrenOf.get(item.id) ?? []).filter((k) => !nodes.has(k.id));
    const node: WbsNode = {
      item,
      code,
      depth,
      parentId,
      childIds: kids.map((k) => k.id),
      index,
      siblingCount,
      start: item.start,
      end: item.end,
      color: statusColor(item.status, colors),
      height: 1,
    };
    nodes.set(item.id, node);
    order.push(item.id);
    if (kids.length === 0) return { leafStart: item.start, leafEnd: item.end };

    let leafStart: Date | null = null;
    let leafEnd: Date | null = null;
    kids.forEach((kid, i) => {
      const span = visit(kid, depth + 1, `${code}.${i + 1}`, item.id, i, kids.length);
      leafStart = minDate(leafStart, span.leafStart);
      leafEnd = maxDate(leafEnd, span.leafEnd);
      node.height = Math.max(node.height, nodes.get(kid.id)!.height + 1);
    });
    node.start = leafStart ?? item.start;
    node.end = leafEnd ?? item.end;
    return { leafStart, leafEnd };
  }

  const roots = childrenOf.get(null) ?? [];
  roots.forEach((root, i) => visit(root, 1, String(i + 1), null, i, roots.length));
  return { nodes, rootIds: roots.map((r) => r.id), order };
}

/** The ids on screen: breakdown order, without the branches under collapsed items. */
export function visibleIds(wbs: Wbs, collapsed: ReadonlySet<number>): number[] {
  const out: number[] = [];
  let hiddenBelow: number | null = null;
  for (const id of wbs.order) {
    const node = wbs.nodes.get(id)!;
    if (hiddenBelow !== null && node.depth > hiddenBelow) continue;
    hiddenBelow = null;
    out.push(id);
    if (collapsed.has(id) && node.childIds.length > 0) hiddenBelow = node.depth;
  }
  return out;
}

/** Every id below an item, at any depth. */
export function descendantIds(wbs: Wbs, id: number): number[] {
  const out: number[] = [];
  const walk = (parent: number) => {
    for (const child of wbs.nodes.get(parent)?.childIds ?? []) {
      out.push(child);
      walk(child);
    }
  };
  walk(id);
  return out;
}

function siblingsOf(wbs: Wbs, node: WbsNode): number[] {
  return node.parentId === null ? wbs.rootIds : wbs.nodes.get(node.parentId)!.childIds;
}

/** Indent: become the last sub-item of the item above at the same level. */
export function indentTarget(wbs: Wbs, id: number): Placement | null {
  const node = wbs.nodes.get(id);
  if (!node || node.index === 0) return null;
  const above = wbs.nodes.get(siblingsOf(wbs, node)[node.index - 1]!)!;
  if (above.depth + node.height > MAX_WBS_DEPTH) return null;
  return { parentId: above.item.id, position: above.childIds.length + 1 };
}

/** Outdent: become the sibling right after the current parent. */
export function outdentTarget(wbs: Wbs, id: number): Placement | null {
  const node = wbs.nodes.get(id);
  if (!node || node.parentId === null) return null;
  const parent = wbs.nodes.get(node.parentId)!;
  return { parentId: parent.parentId, position: parent.index + 2 };
}

export function moveUpTarget(wbs: Wbs, id: number): Placement | null {
  const node = wbs.nodes.get(id);
  if (!node || node.index === 0) return null;
  return { parentId: node.parentId, position: node.index };
}

export function moveDownTarget(wbs: Wbs, id: number): Placement | null {
  const node = wbs.nodes.get(id);
  if (!node || node.index >= node.siblingCount - 1) return null;
  return { parentId: node.parentId, position: node.index + 2 };
}

/** Where a dragged box lands against another: in front of it, behind it, or as its last sub-item. */
export type DropZone = "before" | "after" | "into";

/** False when the item's branch would go deeper than the limit under that parent. */
export function fitsUnder(wbs: Wbs, id: number, parentId: number | null): boolean {
  const node = wbs.nodes.get(id);
  const parentDepth = parentId === null ? 0 : (wbs.nodes.get(parentId)?.depth ?? 0);
  return node !== undefined && parentDepth + node.height <= MAX_WBS_DEPTH;
}

/**
 * The placement for dropping an item against a target box (null = the project
 * box, which takes it as the last top-level item). Null when the drop changes
 * nothing, would put the item inside its own branch, or would go too deep.
 */
export function dropPlacement(
  wbs: Wbs,
  id: number,
  targetId: number | null,
  zone: DropZone,
): Placement | null {
  const node = wbs.nodes.get(id);
  if (!node) return null;
  const branch = new Set([id, ...descendantIds(wbs, id)]);
  let placement: Placement;
  if (targetId === null) {
    placement = { parentId: null, position: wbs.rootIds.filter((r) => r !== id).length + 1 };
  } else {
    const target = wbs.nodes.get(targetId);
    if (!target || branch.has(targetId)) return null;
    if (zone === "into") {
      const kids = target.childIds.filter((k) => k !== id);
      placement = { parentId: targetId, position: kids.length + 1 };
    } else {
      const siblings = siblingsOf(wbs, target).filter((s) => s !== id);
      const at = siblings.indexOf(targetId) + (zone === "before" ? 1 : 2);
      placement = { parentId: target.parentId, position: at };
    }
  }
  if (placement.parentId === node.parentId && placement.position === node.index + 1) return null;
  return fitsUnder(wbs, id, placement.parentId) ? placement : null;
}

function sameParent(item: WbsItem, parentId: number | null): boolean {
  return item.parentId === parentId;
}

function renumber(items: WbsItem[], group: WbsItem[], numberOf: (rank: number) => number) {
  group.sort(bySortOrder).forEach((sibling, rank) => {
    const sortOrder = numberOf(rank + 1);
    if (sibling.sortOrder !== sortOrder) {
      items[items.indexOf(sibling)] = { ...sibling, sortOrder };
    }
  });
}

/** What usp_KeyDeliverable_Move does, applied to the rows on screen. */
export function applyMove(
  items: readonly WbsItem[],
  id: number,
  { parentId, position }: Placement,
): WbsItem[] {
  const moving = items.find((i) => i.id === id);
  if (!moving) return [...items];
  const out = [...items];
  const destination = out.filter((i) => i.id !== id && sameParent(i, parentId));
  const at = Math.min(Math.max(position, 1), destination.length + 1);
  renumber(out, destination, (rank) => (rank >= at ? rank + 1 : rank));
  out[out.indexOf(moving)] = { ...moving, parentId, sortOrder: at };
  if (moving.parentId !== parentId) {
    const former = out.filter((i) => sameParent(i, moving.parentId));
    renumber(out, former, (rank) => rank);
  }
  return out;
}

/**
 * What usp_KeyDeliverable_Reschedule does: an item without sub-items takes the
 * dates; a parent moves its whole branch by the same number of days.
 */
export function applyReschedule(
  items: readonly WbsItem[],
  wbs: Wbs,
  id: number,
  start: Date,
  end: Date,
): WbsItem[] {
  const node = wbs.nodes.get(id);
  if (!node) return [...items];
  if (node.childIds.length === 0) {
    // A milestone is a date: it moves to the day it was dragged to and never gains a length.
    return items.map((i) => (i.id === id ? { ...i, start, end: i.isMilestone ? start : end } : i));
  }
  if (!node.start) return [...items];
  const shift = dayDiff(node.start, start);
  const branch = new Set([id, ...descendantIds(wbs, id)]);
  return items.map((i) =>
    branch.has(i.id)
      ? {
          ...i,
          start: i.start ? addDays(i.start, shift) : null,
          end: i.end ? addDays(i.end, shift) : null,
        }
      : i,
  );
}

export type RequestedDateClash = "item" | "subItem" | "parent";

function endsBefore(end: Date | null, requested: Date | null): boolean {
  return end !== null && requested !== null && end.getTime() < requested.getTime();
}

/**
 * What usp_KeyDeliverable_Reschedule refuses so that no end comes before its
 * requested date: the item's new end, a sub-item its move shifts, or a parent
 * whose rolled-up end moves; a parent already ending before it is let be.
 */
export function requestedDateClash(
  items: readonly WbsItem[],
  wbs: Wbs,
  id: number,
  start: Date,
  end: Date,
): RequestedDateClash | null {
  const node = wbs.nodes.get(id);
  if (!node) return null;
  if (endsBefore(end, node.item.requestedDate)) return "item";
  const next = buildWbs(applyReschedule(items, wbs, id, start, end));
  const shiftedLate = (sub: number) => {
    const row = next.nodes.get(sub)?.item;
    return row !== undefined && endsBefore(row.end, row.requestedDate);
  };
  if (descendantIds(wbs, id).some(shiftedLate)) return "subItem";
  for (let up = node.parentId; up !== null; up = wbs.nodes.get(up)?.parentId ?? null) {
    const before = wbs.nodes.get(up);
    const after = next.nodes.get(up);
    if (!before || !after) break;
    const requested = before.item.requestedDate;
    if (!endsBefore(before.end, requested) && endsBefore(after.end, requested)) return "parent";
  }
  return null;
}

/**
 * Dates for a new item, so it always has a bar to drag:
 * - the first sub-item of an item takes that item's dates, so adding it does
 *   not change the parent's span;
 * - any other item starts the day after the one before it ends;
 * - else the project start, else today; one week long.
 *
 * A new milestone takes the same first day and ends on it, so it is a date from the start.
 */
export function newItemDates(
  wbs: Wbs,
  where: { parentId: number | null; afterId: number | null },
  today: Date,
  projectStart: Date | null,
  asMilestone = false,
): { start: Date; end: Date } {
  const week = (start: Date) =>
    asMilestone ? { start, end: start } : { start, end: addDays(start, NEW_ITEM_DAYS - 1) };
  const parent = where.parentId !== null ? wbs.nodes.get(where.parentId) : undefined;
  const siblings = parent ? parent.childIds : wbs.rootIds;
  const beforeId = where.afterId ?? siblings[siblings.length - 1];
  const before = beforeId !== undefined ? wbs.nodes.get(beforeId) : undefined;
  if (before) {
    if (before.end) return week(addDays(before.end, 1));
    if (before.start) return week(before.start);
  }
  if (parent?.start) {
    if (asMilestone) return { start: parent.start, end: parent.start };
    return { start: parent.start, end: parent.end ?? addDays(parent.start, NEW_ITEM_DAYS - 1) };
  }
  return week(projectStart ? utcDay(projectStart) : today);
}

/** The earliest start and latest end over every item: the span the chart must show. */
export function wbsBounds(wbs: Wbs): { min: Date | null; max: Date | null } {
  let min: Date | null = null;
  let max: Date | null = null;
  for (const node of wbs.nodes.values()) {
    min = minDate(min, node.start);
    max = maxDate(max, node.end ?? node.start);
  }
  return { min, max };
}

/** What usp_KeyDeliverable_SetStatus does, applied to the rows on screen. */
export function applyStatus(
  items: readonly WbsItem[],
  id: number,
  status: string | null,
): WbsItem[] {
  return items.map((i) => (i.id === id ? { ...i, status } : i));
}

/**
 * What usp_KeyDeliverable_SetMilestone does, applied to the rows on screen: turning an item into a
 * milestone collapses its span to its start date; turning it back keeps that one day as both ends,
 * so the person widens it afterwards.
 */
export function applyMilestone(
  items: readonly WbsItem[],
  id: number,
  isMilestone: boolean,
): WbsItem[] {
  return items.map((i) =>
    i.id === id ? { ...i, isMilestone, end: isMilestone && i.start ? i.start : i.end } : i,
  );
}

/**
 * Whether the item may become a milestone: it must have a start date to be a date, and no
 * sub-items, whose dates would roll up into it and contradict its one day (ADR-0046). The proc
 * refuses both under the project lock; this answers the menu so the reason can be shown first.
 */
export function milestoneRefusal(wbs: Wbs, id: number): "subItems" | "noDate" | null {
  const node = wbs.nodes.get(id);
  if (!node) return null;
  if (node.childIds.length > 0) return "subItems";
  if (!node.item.start) return "noDate";
  return null;
}

function withRequirements(
  items: readonly WbsItem[],
  id: number,
  change: (requirements: WbsRequirement[]) => WbsRequirement[],
): WbsItem[] {
  return items.map((i) => (i.id === id ? { ...i, requirements: change(i.requirements) } : i));
}

function numbered(requirements: WbsRequirement[]): WbsRequirement[] {
  return requirements.map((r, index) =>
    r.sortOrder === index + 1 ? r : { ...r, sortOrder: index + 1 },
  );
}

/** The chip in front of a requirement's wording: "FR-1.2", or its type alone until the server has
 *  given a queued one its reference, so the chip never shows one that turns out wrong. The whole
 *  path, not the type and a number: the register shows the same reference and the two must agree
 *  (ADR-0048), and a path cannot be rebuilt here from a row whose parent was never sent. */
export function requirementChip(requirement: WbsRequirement): string {
  return requirement.ref !== "" ? requirement.ref : requirement.type;
}

/** Distinct requirements allocated anywhere in a branch: what deleting the item unallocates. */
export function branchRequirementCount(wbs: Wbs, id: number): number {
  const ids = new Set<number>();
  for (const itemId of [id, ...descendantIds(wbs, id)]) {
    for (const requirement of wbs.nodes.get(itemId)?.item.requirements ?? []) {
      ids.add(requirement.id);
    }
  }
  return ids.size;
}

/** One occurrence of a requirement, for a shared edit or tick; undefined when it is gone. A
 *  requirement can sit on several deliverables, so any occurrence carries the shared fields. */
export function findRequirement(
  items: readonly WbsItem[],
  requirementId: number,
): WbsRequirement | undefined {
  for (const item of items) {
    const found = item.requirements.find((r) => r.id === requirementId);
    if (found) return found;
  }
  return undefined;
}

/** The requirement as it sits on one deliverable, for a move or remove (its own placeRowVer). */
export function requirementIn(
  items: readonly WbsItem[],
  itemId: number,
  requirementId: number,
): WbsRequirement | undefined {
  return items.find((i) => i.id === itemId)?.requirements.find((r) => r.id === requirementId);
}

/** usp_Requirement_Update: new wording or met tick, shared across every item that lists it. */
export function applyRequirementEdit(
  items: readonly WbsItem[],
  requirementId: number,
  edit: { text?: string; isMet?: boolean },
): WbsItem[] {
  return items.map((item) =>
    item.requirements.some((r) => r.id === requirementId)
      ? {
          ...item,
          requirements: item.requirements.map((r) =>
            r.id === requirementId ? { ...r, ...edit } : r,
          ),
        }
      : item,
  );
}

/** usp_Requirement_Move: the requirement at position (from 1) under one deliverable. */
export function applyRequirementMove(
  items: readonly WbsItem[],
  itemId: number,
  requirementId: number,
  position: number,
): WbsItem[] {
  return withRequirements(items, itemId, (list) => {
    const moving = list.find((r) => r.id === requirementId);
    if (!moving) return list;
    const rest = list.filter((r) => r.id !== requirementId);
    const at = Math.min(Math.max(position, 1), rest.length + 1) - 1;
    return numbered([...rest.slice(0, at), moving, ...rest.slice(at)]);
  });
}

/** usp_Requirement_Unallocate: off this one deliverable, the rest renumbered; it stays elsewhere. */
export function applyRequirementRemove(
  items: readonly WbsItem[],
  itemId: number,
  requirementId: number,
): WbsItem[] {
  return withRequirements(items, itemId, (list) =>
    numbered(list.filter((r) => r.id !== requirementId)),
  );
}
