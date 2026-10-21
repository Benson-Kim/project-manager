import type { OptionColor } from "@/lib/lookup-lists";
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

/** An item's requirement. */
export interface WbsRequirement {
  id: number;
  text: string;
  isMet: boolean;
  sortOrder: number;
  rowVer: number;
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
    return items.map((i) => (i.id === id ? { ...i, start, end } : i));
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
 */
export function newItemDates(
  wbs: Wbs,
  where: { parentId: number | null; afterId: number | null },
  today: Date,
  projectStart: Date | null,
): { start: Date; end: Date } {
  const week = (start: Date) => ({ start, end: addDays(start, NEW_ITEM_DAYS - 1) });
  const parent = where.parentId !== null ? wbs.nodes.get(where.parentId) : undefined;
  const siblings = parent ? parent.childIds : wbs.rootIds;
  const beforeId = where.afterId ?? siblings[siblings.length - 1];
  const before = beforeId !== undefined ? wbs.nodes.get(beforeId) : undefined;
  if (before) {
    if (before.end) return week(addDays(before.end, 1));
    if (before.start) return week(before.start);
  }
  if (parent?.start) {
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

/** The item a requirement belongs to; undefined when it is gone. */
export function requirementOwner(
  items: readonly WbsItem[],
  requirementId: number,
): WbsItem | undefined {
  return items.find((i) => i.requirements.some((r) => r.id === requirementId));
}

/** What usp_KeyDeliverableRequirement_Update does: new wording, met or not. */
export function applyRequirementEdit(
  items: readonly WbsItem[],
  requirementId: number,
  edit: { text?: string; isMet?: boolean },
): WbsItem[] {
  const owner = requirementOwner(items, requirementId);
  if (!owner) return [...items];
  return withRequirements(items, owner.id, (list) =>
    list.map((r) => (r.id === requirementId ? { ...r, ...edit } : r)),
  );
}

/** What usp_KeyDeliverableRequirement_Move does: the requirement at position (from 1). */
export function applyRequirementMove(
  items: readonly WbsItem[],
  requirementId: number,
  position: number,
): WbsItem[] {
  const owner = requirementOwner(items, requirementId);
  if (!owner) return [...items];
  return withRequirements(items, owner.id, (list) => {
    const moving = list.find((r) => r.id === requirementId)!;
    const rest = list.filter((r) => r.id !== requirementId);
    const at = Math.min(Math.max(position, 1), rest.length + 1) - 1;
    return numbered([...rest.slice(0, at), moving, ...rest.slice(at)]);
  });
}

/** What usp_KeyDeliverableRequirement_Delete does: gone, the rest renumbered. */
export function applyRequirementDelete(
  items: readonly WbsItem[],
  requirementId: number,
): WbsItem[] {
  const owner = requirementOwner(items, requirementId);
  if (!owner) return [...items];
  return withRequirements(items, owner.id, (list) =>
    numbered(list.filter((r) => r.id !== requirementId)),
  );
}
