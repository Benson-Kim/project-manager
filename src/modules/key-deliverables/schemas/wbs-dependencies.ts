import type { Wbs, WbsItem } from "./wbs";
import { addDays, buildWbs, dayDiff, descendantIds } from "./wbs";

/**
 * Dependencies between work breakdown items (ADR-0046 decisions 5-10). Pure functions over the
 * rows usp_KeyDeliverable_GanttData returns, mirroring dbo.usp_KeyDeliverable_CascadeDependencies
 * and dbo.usp_KeyDeliverableDependency_Link so the editor can show a link, and everything the
 * link moves, before the server confirms it.
 *
 * The rule in one place: a link says the earliest day its successor may start or finish, and a
 * successor that is earlier than that is pushed forward to it — never pulled back (decision 7).
 */

/** Must equal CK_KeyDeliverableDependency_Type in db/migrations/044. */
export const DEPENDENCY_TYPES = ["FS", "SS", "FF", "SF"] as const;

export type DependencyType = (typeof DEPENDENCY_TYPES)[number];

/** Must equal CK_KeyDeliverableDependency_Lag in db/migrations/044. */
export const LAG_MIN_DAYS = -3650;
export const LAG_MAX_DAYS = 3650;

/** Must equal @MaxRounds in dbo.usp_KeyDeliverable_CascadeDependencies. */
export const MAX_CASCADE_ROUNDS = 50;

/** One link, as the editor holds it: the successor is the row GanttData returned it on. */
export interface WbsLink {
  id: number;
  predecessorId: number;
  successorId: number;
  type: DependencyType;
  lagDays: number;
  rowVer: number;
}

/** The two dates a link reads from an item: rolled up for a parent, its own for a leaf. */
export interface Span {
  start: Date | null;
  end: Date | null;
}

export function isDependencyType(value: string): value is DependencyType {
  return (DEPENDENCY_TYPES as readonly string[]).includes(value);
}

export function isLagInRange(lagDays: number): boolean {
  return Number.isInteger(lagDays) && lagDays >= LAG_MIN_DAYS && lagDays <= LAG_MAX_DAYS;
}

/**
 * The earliest day the link allows its successor, and whether that day is read against the
 * successor's start or its end. Only FS carries the +1: the ends are inclusive, so a successor
 * starting on its predecessor's last day would overlap it. At lag 0 that is the whole difference
 * between FS and SS.
 */
function boundary(
  type: DependencyType,
  predecessor: Span,
  lagDays: number,
): { earliest: Date | null; against: "start" | "end" } {
  switch (type) {
    case "FS":
      return {
        earliest: predecessor.end ? addDays(predecessor.end, 1 + lagDays) : null,
        against: "start",
      };
    case "SS":
      return {
        earliest: predecessor.start ? addDays(predecessor.start, lagDays) : null,
        against: "start",
      };
    case "FF":
      return {
        earliest: predecessor.end ? addDays(predecessor.end, lagDays) : null,
        against: "end",
      };
    case "SF":
      return {
        earliest: predecessor.start ? addDays(predecessor.start, lagDays) : null,
        against: "end",
      };
  }
}

/**
 * Days the successor must move forward for this link to hold, or 0 when it already does.
 * An undated end makes the link unschedulable, which is 0 days rather than a guess —
 * dbo.usp_KeyDeliverable_CascadeDependencies skips the same rows.
 */
export function requiredShiftDays(
  type: DependencyType,
  predecessor: Span,
  successor: Span,
  lagDays: number,
): number {
  if (successor.start === null || successor.end === null) return 0;
  const { earliest, against } = boundary(type, predecessor, lagDays);
  if (earliest === null) return 0;
  const shift = dayDiff(against === "start" ? successor.start : successor.end, earliest);
  return shift > 0 ? shift : 0;
}

/** The link holds where it stands. A violated one is drawn broken until the schedule catches up. */
export function isSatisfied(link: WbsLink, wbs: Wbs): boolean {
  return shiftForLink(link, wbs) === 0;
}

function shiftForLink(link: WbsLink, wbs: Wbs): number {
  const predecessor = wbs.nodes.get(link.predecessorId);
  const successor = wbs.nodes.get(link.successorId);
  if (!predecessor || !successor) return 0;
  return requiredShiftDays(
    link.type,
    { start: predecessor.start, end: predecessor.end },
    { start: successor.start, end: successor.end },
    link.lagDays,
  );
}

/** Every link that does not hold, for the broken arrows and the toolbar's count. */
export function violatedLinks(links: readonly WbsLink[], wbs: Wbs): WbsLink[] {
  return links.filter((link) => !isSatisfied(link, wbs));
}

/**
 * What dbo.usp_KeyDeliverable_CascadeDependencies does, applied to the rows on screen: push every
 * successor that starts or finishes too early to the earliest day its links allow, roll the parents
 * up by rebuilding the tree, and repeat until nothing moves.
 *
 * A successor with sub-items moves as a whole branch, so a summary keeps its shape and a milestone
 * keeps its one day. When one violated item sits under another, only the upper one moves this
 * round: the branch shift carries the lower one and the next round re-reads where it landed.
 */
export function cascadeSchedule(items: readonly WbsItem[], links: readonly WbsLink[]): WbsItem[] {
  let current = [...items];
  if (links.length === 0) return current;

  for (let round = 0; round < MAX_CASCADE_ROUNDS; round += 1) {
    const wbs = buildWbs(current);
    const shifts = new Map<number, number>();
    for (const link of links) {
      const shift = shiftForLink(link, wbs);
      if (shift > 0)
        shifts.set(link.successorId, Math.max(shifts.get(link.successorId) ?? 0, shift));
    }
    if (shifts.size === 0) return current;

    for (const id of [...shifts.keys()]) {
      if (hasAncestorIn(wbs, id, shifts)) shifts.delete(id);
    }

    const byId = new Map<number, number>();
    for (const [id, shift] of shifts) {
      for (const member of [id, ...descendantIds(wbs, id)]) {
        byId.set(member, Math.max(byId.get(member) ?? 0, shift));
      }
    }
    current = current.map((item) => {
      const shift = byId.get(item.id);
      if (shift === undefined || !item.start || !item.end) return item;
      return { ...item, start: addDays(item.start, shift), end: addDays(item.end, shift) };
    });
  }
  return current;
}

function hasAncestorIn(wbs: Wbs, id: number, set: ReadonlyMap<number, number>): boolean {
  for (
    let up = wbs.nodes.get(id)?.parentId ?? null;
    up !== null;
    up = wbs.nodes.get(up)?.parentId ?? null
  ) {
    if (set.has(up)) return true;
  }
  return false;
}

/**
 * The items the schedule would carry along with a change the person is making, so a drag can name
 * its consequence before it commits (decision 9). `next` is the rows with that change already
 * applied; the answer is every other row the cascade then moves.
 */
export function cascadeEffect(next: readonly WbsItem[], links: readonly WbsLink[]): number[] {
  const asked = new Map(next.map((i) => [i.id, i]));
  return cascadeSchedule(next, links)
    .filter((item) => {
      const was = asked.get(item.id);
      return was !== undefined && !sameSpan(item, was);
    })
    .map((item) => item.id);
}

function sameSpan(
  a: { start: Date | null; end: Date | null },
  b: { start: Date | null; end: Date | null },
): boolean {
  return (
    (a.start?.getTime() ?? null) === (b.start?.getTime() ?? null) &&
    (a.end?.getTime() ?? null) === (b.end?.getTime() ?? null)
  );
}

export type LinkRefusal = "self" | "duplicate" | "related" | "cycle";

/**
 * Why dbo.usp_KeyDeliverableDependency_Link would refuse this pair, so the panel can say it
 * before asking. Each of these spans rows, which is why none of them is a constraint and all four
 * are taken under the project lock.
 */
export function linkRefusal(
  wbs: Wbs,
  links: readonly WbsLink[],
  predecessorId: number,
  successorId: number,
): LinkRefusal | null {
  if (predecessorId === successorId) return "self";
  if (links.some((l) => l.predecessorId === predecessorId && l.successorId === successorId)) {
    return "duplicate";
  }
  if (isRelated(wbs, predecessorId, successorId)) return "related";
  if (reaches(links, successorId, predecessorId)) return "cycle";
  return null;
}

/** One item is the other's summary or sub-item: a bracket already contains its branch. */
function isRelated(wbs: Wbs, a: number, b: number): boolean {
  return descendantIds(wbs, a).includes(b) || descendantIds(wbs, b).includes(a);
}

/** Whether `to` can be reached by following links forward from `from`. */
function reaches(links: readonly WbsLink[], from: number, to: number): boolean {
  const seen = new Set<number>([from]);
  const queue = [from];
  while (queue.length > 0) {
    const at = queue.shift() as number;
    for (const link of links) {
      if (link.predecessorId !== at || seen.has(link.successorId)) continue;
      if (link.successorId === to) return true;
      seen.add(link.successorId);
      queue.push(link.successorId);
    }
  }
  return false;
}

export function applyLink(links: readonly WbsLink[], link: WbsLink): WbsLink[] {
  return [...links, link];
}

export function applyRelink(
  links: readonly WbsLink[],
  id: number,
  type: DependencyType,
  lagDays: number,
): WbsLink[] {
  return links.map((l) => (l.id === id ? { ...l, type, lagDays } : l));
}

export function applyUnlink(links: readonly WbsLink[], id: number): WbsLink[] {
  return links.filter((l) => l.id !== id);
}

/** Links of an item, in both directions, for the Dependencies panel. */
export function linksOf(
  links: readonly WbsLink[],
  id: number,
): { predecessors: WbsLink[]; successors: WbsLink[] } {
  return {
    predecessors: links.filter((l) => l.successorId === id),
    successors: links.filter((l) => l.predecessorId === id),
  };
}

/** Links that go when an item's branch goes, at either end (usp_KeyDeliverable_Delete). */
export function linksTouching(wbs: Wbs, links: readonly WbsLink[], id: number): WbsLink[] {
  const branch = new Set([id, ...descendantIds(wbs, id)]);
  return links.filter((l) => branch.has(l.predecessorId) || branch.has(l.successorId));
}
