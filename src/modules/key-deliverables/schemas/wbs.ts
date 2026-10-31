import type { OptionColor } from "@/lib/lookup-lists";
import type { MoSCoW } from "@/modules/requirements/schemas/moscow";
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
  /** The register parent, so an allocated sub-requirement nests under an allocated parent. */
  parentId: number | null;
  /** Planning (ADR-0052); null is "not set". */
  moscow: MoSCoW | null;
  criteria: string | null;
  estimateDays: number | null;
  ownerId: number | null;
  ownerName: string | null;
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
  /** Its own colour (ADR-0052): drawn over the level's on its box; null takes the level's. */
  color: OptionColor | null;
  /** A date rather than a span (ADR-0046): start and end are the same day, and it has no sub-items. */
  isMilestone: boolean;
  assigneeNames: string | null;
  assignees: AssigneeEntry[];
  requirements: WbsRequirement[];
  /** The item's own planned amount (ADR-0052); a parent shows its sub-items' sum (rolledBudget). */
  budget: number | null;
  /** The note pinned to its box (the paperclip). */
  note: string | null;
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

/** A note as usp_KeyDeliverable_SetNote and SetPlanNote store it: trailing spaces off, blank = none. */
export function storedNote(text: string): string | null {
  const kept = text.replace(/ +$/, "");
  return kept === "" ? null : kept;
}

/** What usp_KeyDeliverable_SetNote does, applied to the rows on screen. */
export function applyNote(items: readonly WbsItem[], id: number, text: string): WbsItem[] {
  const note = storedNote(text);
  return items.map((i) => (i.id === id ? { ...i, note } : i));
}

/** The status the details panel's Done sets; statusToCompletion counts it as 100 %. */
export const DONE_STATUS = "Completed";

/** What the details panel changes through usp_KeyDeliverable_Update; a key left out is kept. */
export interface WbsDetailsPatch {
  assignees?: AssigneeEntry[];
  priority?: string | null;
  color?: OptionColor | null;
  budget?: number | null;
}

/** What usp_KeyDeliverable_Update does with a patch, applied to the rows on screen. */
export function applyDetails(
  items: readonly WbsItem[],
  id: number,
  patch: WbsDetailsPatch,
): WbsItem[] {
  return items.map((i) => {
    if (i.id !== id) return i;
    const next = { ...i };
    if (patch.assignees !== undefined) {
      next.assignees = patch.assignees;
      next.assigneeNames = patch.assignees.map((a) => a.name).join(", ") || null;
    }
    if (patch.priority !== undefined) next.priority = patch.priority;
    if (patch.color !== undefined) next.color = patch.color;
    if (patch.budget !== undefined) next.budget = patch.budget;
    return next;
  });
}

/**
 * The whole update usp_KeyDeliverable_Update takes for an item, built from the item as it is now
 * with the patch over it. Name, dates and status go back as they are (a parent's dates are its
 * rolled-up ones, which the proc keeps); colour and budget are sent only when patched.
 */
export function detailsInput(item: WbsItem, projectId: number, patch: WbsDetailsPatch) {
  return {
    keyDeliverableId: item.id,
    projectId,
    keyRequirement: item.name,
    requestedDate: item.requestedDate,
    startDate: item.start,
    deadline: item.end,
    assigneeIds: (patch.assignees ?? item.assignees).map((a) => a.id),
    priority: patch.priority !== undefined ? patch.priority : item.priority,
    status: item.status,
    ...(patch.color !== undefined ? { color: patch.color } : {}),
    ...(patch.budget !== undefined ? { budget: patch.budget } : {}),
    rowVer: item.rowVer,
  };
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

/** What one requirement save changes: wording, met tick, MoSCoW or the planning fields. */
export type RequirementEdit = Partial<
  Pick<
    WbsRequirement,
    "text" | "isMet" | "moscow" | "criteria" | "estimateDays" | "ownerId" | "ownerName"
  >
>;

/** Criteria, estimate and owner: usp_Requirement_SetPlanning takes all three together. */
export type RequirementPlanning = Pick<
  WbsRequirement,
  "criteria" | "estimateDays" | "ownerId" | "ownerName"
>;

/** A requirement save, shared across every item that lists it. */
export function applyRequirementEdit(
  items: readonly WbsItem[],
  requirementId: number,
  edit: RequirementEdit,
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

/** A requirement's parent within one item's allocated set: null when its parent is not allocated there. */
function allocatedParent(requirement: WbsRequirement, ids: ReadonlySet<number>): number | null {
  return requirement.parentId !== null && ids.has(requirement.parentId)
    ? requirement.parentId
    : null;
}

/**
 * An item's requirements as an outline: each parent before its sub-requirements, siblings by
 * sortOrder, depth from 0. A parent loop still lists each requirement once.
 */
export function requirementOutline(
  requirements: readonly WbsRequirement[],
): { requirement: WbsRequirement; depth: number }[] {
  const ids = new Set(requirements.map((r) => r.id));
  const bySort = [...requirements].sort((a, b) => a.sortOrder - b.sortOrder);
  const out: { requirement: WbsRequirement; depth: number }[] = [];
  const seen = new Set<number>();
  const visit = (r: WbsRequirement, depth: number) => {
    if (seen.has(r.id)) return;
    seen.add(r.id);
    out.push({ requirement: r, depth });
    for (const child of bySort) if (child.parentId === r.id) visit(child, depth + 1);
  };
  for (const r of bySort) if (allocatedParent(r, ids) === null) visit(r, 0);
  for (const r of bySort) visit(r, 0);
  return out;
}

/**
 * Tab in the quick-add: a new requirement at the end of `parentId`'s list nests under the last
 * saved requirement there. Undefined when there is none to nest under.
 */
export function requirementIndent(
  requirements: readonly WbsRequirement[],
  parentId: number | null,
): number | undefined {
  const ids = new Set(requirements.map((r) => r.id));
  const siblings = requirementOutline(requirements)
    .map((e) => e.requirement)
    .filter((r) => r.id > 0 && allocatedParent(r, ids) === parentId);
  return siblings.at(-1)?.id;
}

/** Shift+Tab in the quick-add: one level up. Undefined at the top level. */
export function requirementOutdent(
  requirements: readonly WbsRequirement[],
  parentId: number | null,
): number | null | undefined {
  if (parentId === null) return undefined;
  const ids = new Set(requirements.map((r) => r.id));
  const parent = requirements.find((r) => r.id === parentId);
  return parent ? allocatedParent(parent, ids) : null;
}

/** Map a status string to a completion percentage: an item's progress when it has no requirements. */
export function statusToCompletion(status: string | null): number {
  switch (status) {
    case DONE_STATUS:
      return 100;
    case "In Progress":
      return 50;
    case "On Hold":
      return 20;
    default:
      return 0;
  }
}

function average(values: readonly number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** The sum of the values that are set, rounded to `places` decimals, or null when none is. */
function sumOrNull(values: readonly (number | null)[], places: number): number | null {
  const set = values.filter((v): v is number => v !== null);
  if (set.length === 0) return null;
  const scale = 10 ** places;
  return Math.round(set.reduce((s, v) => s + v, 0) * scale) / scale;
}

/**
 * Percent done of the requirements allocated to one item, from their met ticks (ADR-0052), or null
 * when it has none. The allocated set is read as a tree by parentId: a requirement whose parent is
 * also allocated here nests under it. A leaf of that tree is 100 or 0 by its tick; one with
 * allocated sub-requirements is the average of them, whatever its own tick says, since the tick on
 * a parent restates what its children already answer. The item is the average of the tree's tops.
 */
export function requirementsProgress(requirements: readonly WbsRequirement[]): number | null {
  if (requirements.length === 0) return null;
  const ids = new Set(requirements.map((r) => r.id));
  const children = new Map<number, WbsRequirement[]>();
  for (const r of requirements) {
    if (r.parentId === null || !ids.has(r.parentId)) continue;
    const list = children.get(r.parentId) ?? [];
    list.push(r);
    children.set(r.parentId, list);
  }
  const done = (r: WbsRequirement, seen: ReadonlySet<number>): number => {
    const kids = (children.get(r.id) ?? []).filter((k) => !seen.has(k.id));
    if (kids.length === 0) return r.isMet ? 100 : 0;
    const next = new Set(seen).add(r.id);
    return average(kids.map((k) => done(k, next)));
  };
  const tops = requirements.filter((r) => r.parentId === null || !ids.has(r.parentId));
  return average(tops.map((r) => done(r, new Set())));
}

/**
 * Percent done of every item, 0 to 100, unrounded (ADR-0052). A parent is the average of its
 * sub-items. A leaf with allocated requirements is requirementsProgress; one without falls back to
 * its status (statusToCompletion), so a plan with no requirements reads as it always has.
 */
export function itemProgress(wbs: Wbs): Map<number, number> {
  const out = new Map<number, number>();
  const visit = (id: number): number => {
    const node = wbs.nodes.get(id)!;
    const value =
      node.childIds.length > 0
        ? average(node.childIds.map(visit))
        : (requirementsProgress(node.item.requirements) ?? statusToCompletion(node.item.status));
    out.set(id, value);
    return value;
  };
  for (const id of wbs.rootIds) visit(id);
  return out;
}

/** The whole plan's percent done: the average of its top-level items, or 0 with none. */
export function planProgress(wbs: Wbs, progress: ReadonlyMap<number, number>): number {
  if (wbs.rootIds.length === 0) return 0;
  return average(wbs.rootIds.map((id) => progress.get(id) ?? 0));
}

/**
 * Every item's budget (ADR-0052): a leaf's own, a parent's the sum of its sub-items', as its dates
 * are rolled up from them. usp_KeyDeliverable_Update refuses a budget on a parent for the same
 * reason. Null when nothing in the branch has one, so "no budget" never reads as 0.
 */
export function rolledBudget(wbs: Wbs): Map<number, number | null> {
  const out = new Map<number, number | null>();
  const visit = (id: number): number | null => {
    const node = wbs.nodes.get(id)!;
    const value =
      node.childIds.length === 0 ? node.item.budget : sumOrNull(node.childIds.map(visit), 2);
    out.set(id, value);
    return value;
  };
  for (const id of wbs.rootIds) visit(id);
  return out;
}

/** The plan's budget: the sum of its top-level items', or null when none has one. */
export function planBudget(wbs: Wbs, budgets: ReadonlyMap<number, number | null>): number | null {
  return sumOrNull(
    wbs.rootIds.map((id) => budgets.get(id) ?? null),
    2,
  );
}

/** Effort in days (ADR-0052): the estimates of the requirements allocated to an item, or null. */
export function itemEffort(requirements: readonly WbsRequirement[]): number | null {
  return sumOrNull(
    requirements.map((r) => r.estimateDays),
    1,
  );
}

/**
 * Every item's effort in days (ADR-0052): its own requirements' estimates (itemEffort) plus its
 * sub-items' rolled effort. Unlike budget, a parent's own requirements count, since work allocated
 * at a parent is still work. Null when nothing in the branch has an estimate, so it never reads as 0.
 */
export function rolledEffort(wbs: Wbs): Map<number, number | null> {
  const out = new Map<number, number | null>();
  const visit = (id: number): number | null => {
    const node = wbs.nodes.get(id)!;
    const value = sumOrNull([itemEffort(node.item.requirements), ...node.childIds.map(visit)], 1);
    out.set(id, value);
    return value;
  };
  for (const id of wbs.rootIds) visit(id);
  return out;
}
