import type { Wbs } from "./wbs";
import type { WbsLink } from "./wbs-dependencies";

export interface CriticalPath {
  itemIds: ReadonlySet<number>;
  linkIds: ReadonlySet<number>;
}

interface DaySpan {
  start: number;
  end: number;
}

/** The dated items and the links between them, with the order a backward pass settles them in. */
interface Network {
  wbs: Wbs;
  spans: ReadonlyMap<number, DaySpan>;
  links: readonly WbsLink[];
  asPredecessor: ReadonlyMap<number, readonly WbsLink[]>;
  order: readonly number[];
}

const DAY_MS = 86_400_000;

/** Bounds the work on a loop, which may never settle, so the whole walk stays linear. */
const MAX_LOOP_ROUNDS = 500;

/** The UTC calendar day a date falls on, counted from 1970-01-01; the same as dayDiff from the epoch. */
const day = (date: Date) => Math.floor(date.getTime() / DAY_MS);

/**
 * The items that cannot finish a day later without moving a finish that matters, read from the
 * dates as they stand. Two backward passes give each item the latest day it may end under its
 * links and its parent: one from the project's last finish, and one from the end of the key
 * deliverable the item sits in. An item with no days to spare against the last finish is critical,
 * with every summary above it. An item with no days to spare against its deliverable's end is
 * critical with the summaries above it inside that deliverable, so each deliverable shows the path
 * that sets its own end. A link is critical when it alone leaves its predecessor no days to spare.
 * Undated items, and links that touch one, are left out.
 */
export function criticalPath(wbs: Wbs, links: readonly WbsLink[]): CriticalPath {
  const spans = new Map<number, DaySpan>();
  for (const [id, node] of wbs.nodes) {
    if (node.start && node.end) spans.set(id, { start: day(node.start), end: day(node.end) });
  }
  if (spans.size === 0) return { itemIds: new Set(), linkIds: new Set() };

  let finish = -Infinity;
  for (const span of spans.values()) finish = Math.max(finish, span.end);
  const network = networkOf(wbs, spans, links);

  const toFinish = latestEnds(network, () => finish);
  const deliverableEnds = new Map<number, number>();
  for (const id of spans.keys()) {
    const top = topLevelOf(wbs, id);
    deliverableEnds.set(id, top === id ? finish : (spans.get(top)?.end ?? finish));
  }
  const toDeliverable = [...deliverableEnds.values()].some((end) => end < finish)
    ? latestEnds(network, (id) => deliverableEnds.get(id)!)
    : toFinish;

  const itemIds = new Set<number>();
  const mark = (id: number, upToTopLevel: boolean) => {
    for (let up: number | null = id; up !== null && !itemIds.has(up);) {
      const parentId: number | null = wbs.nodes.get(up)?.parentId ?? null;
      if (up !== id && parentId === null && !upToTopLevel) return;
      itemIds.add(up);
      up = parentId;
    }
  };
  for (const [id, span] of spans) if (toFinish.get(id)! <= span.end) mark(id, true);
  for (const [id, span] of spans) if (toDeliverable.get(id)! <= span.end) mark(id, false);

  const linkIds = new Set<number>();
  for (const link of network.links) {
    if (!itemIds.has(link.successorId)) continue;
    if (boundOf(network, toDeliverable, link) <= spans.get(link.predecessorId)!.end) {
      linkIds.add(link.id);
    }
  }
  return { itemIds, linkIds };
}

function networkOf(
  wbs: Wbs,
  spans: ReadonlyMap<number, DaySpan>,
  allLinks: readonly WbsLink[],
): Network {
  const links = allLinks.filter((l) => spans.has(l.predecessorId) && spans.has(l.successorId));
  const asPredecessor = new Map<number, WbsLink[]>();
  for (const link of links) {
    const list = asPredecessor.get(link.predecessorId);
    if (list) list.push(link);
    else asPredecessor.set(link.predecessorId, [link]);
  }
  return { wbs, spans, links, asPredecessor, order: dependencyOrder(wbs, spans, links) };
}

/**
 * The latest day each dated item may end, starting every item at its seed and lowering it under
 * its parent and under each link it leads, until nothing moves or the loop budget runs out.
 */
function latestEnds(network: Network, seed: (id: number) => number): ReadonlyMap<number, number> {
  const { wbs, spans, links, asPredecessor, order } = network;
  const latest = new Map<number, number>();
  for (const id of spans.keys()) latest.set(id, seed(id));

  for (const id of order) {
    const parentId = wbs.nodes.get(id)!.parentId;
    let allowed = Math.min(
      latest.get(id)!,
      parentId === null ? Infinity : (latest.get(parentId) ?? Infinity),
    );
    for (const link of asPredecessor.get(id) ?? []) {
      allowed = Math.min(allowed, boundOf(network, latest, link));
    }
    latest.set(id, allowed);
  }

  const loopRounds = Math.min(spans.size + links.length, MAX_LOOP_ROUNDS);
  for (let round = 0; round <= loopRounds; round += 1) {
    let changed = false;
    for (const link of links) {
      const allowed = boundOf(network, latest, link);
      if (allowed < latest.get(link.predecessorId)!) {
        latest.set(link.predecessorId, allowed);
        changed = true;
      }
    }
    for (const [id, node] of wbs.nodes) {
      const own = latest.get(id);
      const parent = node.parentId === null ? undefined : latest.get(node.parentId);
      if (own !== undefined && parent !== undefined && parent < own) {
        latest.set(id, parent);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return latest;
}

/** The key deliverable an item sits in: its top-level ancestor, or the item itself at the top. */
function topLevelOf(wbs: Wbs, id: number): number {
  let top = id;
  for (let steps = 0; steps < wbs.nodes.size; steps += 1) {
    const parentId = wbs.nodes.get(top)?.parentId ?? null;
    if (parentId === null || !wbs.nodes.has(parentId)) break;
    top = parentId;
  }
  return top;
}

function boundOf(network: Network, latest: ReadonlyMap<number, number>, link: WbsLink): number {
  return latestEndUnder(
    link,
    network.spans.get(link.predecessorId)!,
    network.spans.get(link.successorId)!,
    latest.get(link.successorId)!,
  );
}

/**
 * Dated items ordered so each comes after its link successors and its parent, which lets one pass
 * settle every latest end. Items on a loop of links are left out for the relaxation rounds to settle.
 */
function dependencyOrder(
  wbs: Wbs,
  spans: ReadonlyMap<number, DaySpan>,
  links: readonly WbsLink[],
): number[] {
  const after = new Map<number, number[]>();
  const waiting = new Map<number, number>();
  const settleBefore = (first: number, then: number) => {
    const list = after.get(first);
    if (list) list.push(then);
    else after.set(first, [then]);
    waiting.set(then, (waiting.get(then) ?? 0) + 1);
  };
  for (const link of links) settleBefore(link.successorId, link.predecessorId);
  for (const id of spans.keys()) {
    const parentId = wbs.nodes.get(id)!.parentId;
    if (parentId !== null && spans.has(parentId)) settleBefore(parentId, id);
  }
  const order = [...spans.keys()].filter((id) => !waiting.has(id));
  for (let i = 0; i < order.length; i += 1) {
    for (const next of after.get(order[i]) ?? []) {
      const left = waiting.get(next)! - 1;
      waiting.set(next, left);
      if (left === 0) order.push(next);
    }
  }
  return order;
}

/** The latest day the predecessor may end so this link still lets the successor keep its latest end. */
function latestEndUnder(
  link: WbsLink,
  predecessor: DaySpan,
  successor: DaySpan,
  successorLatestEnd: number,
): number {
  const successorLatestStart = successorLatestEnd - (successor.end - successor.start);
  const predecessorDays = predecessor.end - predecessor.start;
  switch (link.type) {
    case "FS":
      return successorLatestStart - 1 - link.lagDays;
    case "SS":
      return successorLatestStart - link.lagDays + predecessorDays;
    case "FF":
      return successorLatestEnd - link.lagDays;
    case "SF":
      return successorLatestEnd - link.lagDays + predecessorDays;
  }
}
