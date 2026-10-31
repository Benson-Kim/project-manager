import type { Wbs, WbsNode } from "../schemas/wbs";
import { barBox, dayCentre, type Timeline } from "./gantt-scale";

/**
 * Where the Gantt draws each item. A top-level item with sub-items is a group
 * (a pill down the left), a second-level one with sub-items is a named lane,
 * every other item down to the third level is a card, and anything deeper is a
 * tile inside its card. Cards in a lane pack into lines by their dates, left to
 * right, never overlapping and never past the chart's right edge.
 */

/** The narrowest a card is drawn, however short its dates. */
export const CARD_MIN_PX = 252;
/** Room a milestone's diamond takes in its line. */
export const MILESTONE_PX = 24;
/** Space kept between two cards on one line. */
export const CARD_GAP_PX = 8;

export type GanttRole = "group" | "lane" | "card" | "tile";

export function ganttRole(node: WbsNode): GanttRole {
  if (node.depth >= 4) return "tile";
  if (node.depth === 3 || node.childIds.length === 0) return "card";
  return node.depth === 1 ? "group" : "lane";
}

export interface GanttEntry {
  id: number;
  kind: "card" | "milestone";
  /** Left edge, in px from the timeline's first day. */
  x: number;
  width: number;
  /** No dates yet: drawn at the start of the chart. */
  undated: boolean;
}

export interface GanttLane {
  /** The item that names the lane; null for a group's own cards or top-level cards. */
  id: number | null;
  /** Where a card dropped into this lane goes: under this item, null = top level. */
  parentId: number | null;
  /** Top to bottom; each line left to right. */
  lines: GanttEntry[][];
}

export interface GanttGroup {
  /** The item on the pill; null for a run of top-level items without sub-items. */
  id: number | null;
  lanes: GanttLane[];
}

export interface GanttLayout {
  groups: GanttGroup[];
  /** The timeline's width, or a card's when that is wider. */
  width: number;
}

function entryOf(node: WbsNode, timeline: Timeline, right: number): GanttEntry {
  const id = node.item.id;
  if (node.item.isMilestone && node.start) {
    const centre = dayCentre(timeline, node.start);
    const x = Math.min(Math.max(0, centre - MILESTONE_PX / 2), right - MILESTONE_PX);
    return { id, kind: "milestone", x, width: MILESTONE_PX, undated: false };
  }
  if (!node.start || !node.end) {
    return { id, kind: "card", x: 0, width: CARD_MIN_PX, undated: true };
  }
  const bar = barBox(timeline, node.start, node.end);
  const width = Math.min(Math.max(bar.width, CARD_MIN_PX), right);
  return {
    id,
    kind: "card",
    x: Math.max(0, Math.min(bar.left, right - width)),
    width,
    undated: false,
  };
}

/** First fit: each entry, by its left edge, on the first line it does not overlap. */
export function packLines(entries: readonly GanttEntry[]): GanttEntry[][] {
  const lines: { end: number; entries: GanttEntry[] }[] = [];
  const sorted = entries
    .map((entry, i) => ({ entry, i }))
    .sort((a, b) => a.entry.x - b.entry.x || a.i - b.i);
  for (const { entry } of sorted) {
    let line = lines.find((l) => l.end + CARD_GAP_PX <= entry.x);
    if (!line) {
      line = { end: 0, entries: [] };
      lines.push(line);
    }
    line.entries.push(entry);
    line.end = entry.x + entry.width;
  }
  return lines.map((l) => l.entries);
}

/**
 * The space before each entry of a line: from the end of the one before it (or
 * the chart's left edge) to its own left edge. Drawn as margins, a line keeps
 * its places however tall an opened card grows.
 */
export function lineGaps(line: readonly GanttEntry[]): number[] {
  let end = 0;
  return line.map((entry) => {
    const gap = Math.max(0, entry.x - end);
    end = Math.max(end, entry.x + entry.width);
    return gap;
  });
}

function lane(
  wbs: Wbs,
  ids: readonly number[],
  timeline: Timeline,
  right: number,
  named: number | null,
  parentId: number | null,
): GanttLane {
  const entries = ids.map((id) => entryOf(wbs.nodes.get(id)!, timeline, right));
  return { id: named, parentId, lines: packLines(entries) };
}

export function ganttLayout(wbs: Wbs, timeline: Timeline): GanttLayout {
  const right = Math.max(timeline.width, CARD_MIN_PX);
  const groups: GanttGroup[] = [];
  let loose: number[] = [];
  const flush = () => {
    if (loose.length === 0) return;
    groups.push({ id: null, lanes: [lane(wbs, loose, timeline, right, null, null)] });
    loose = [];
  };
  for (const id of wbs.rootIds) {
    const node = wbs.nodes.get(id)!;
    if (ganttRole(node) === "card") {
      loose.push(id);
      continue;
    }
    flush();
    const own = node.childIds.filter((c) => ganttRole(wbs.nodes.get(c)!) === "card");
    const lanes = own.length > 0 ? [lane(wbs, own, timeline, right, null, id)] : [];
    for (const c of node.childIds) {
      const child = wbs.nodes.get(c)!;
      if (ganttRole(child) === "lane") lanes.push(lane(wbs, child.childIds, timeline, right, c, c));
    }
    groups.push({ id, lanes });
  }
  flush();
  return { groups, width: right };
}

/** What the Gantt's display settings show; kept per browser. */
export interface GanttDisplay {
  progress: boolean;
  dates: boolean;
  today: boolean;
  assignees: boolean;
  milestones: boolean;
}

export const GANTT_DISPLAY: GanttDisplay = {
  progress: true,
  dates: true,
  today: true,
  assignees: true,
  milestones: true,
};

/** Saved settings, each one that is missing or not a flag taken from the defaults. */
export function readGanttDisplay(saved: unknown): GanttDisplay {
  const read = { ...GANTT_DISPLAY };
  if (typeof saved !== "object" || saved === null) return read;
  for (const key of Object.keys(read) as (keyof GanttDisplay)[]) {
    const value = (saved as Record<string, unknown>)[key];
    if (typeof value === "boolean") read[key] = value;
  }
  return read;
}

/** How many of an item's own requirements are met, out of how many. */
export function requirementTally(requirements: readonly { isMet: boolean }[]): {
  met: number;
  total: number;
} {
  return { met: requirements.filter((r) => r.isMet).length, total: requirements.length };
}

/** The card that shows an item: itself, or the card a tile sits in; null for a group or lane. */
export function cardOf(wbs: Wbs, id: number): number | null {
  let node = wbs.nodes.get(id);
  while (node && ganttRole(node) === "tile") {
    node = node.parentId === null ? undefined : wbs.nodes.get(node.parentId);
  }
  return node && ganttRole(node) === "card" ? node.item.id : null;
}

/** A card's tiles: every item under it, depth first, `depth` 1 for its own sub-items. */
export function cardTiles(wbs: Wbs, id: number): { id: number; depth: number }[] {
  const tiles: { id: number; depth: number }[] = [];
  const seen = new Set<number>([id]);
  const walk = (parent: number, depth: number) => {
    for (const c of wbs.nodes.get(parent)?.childIds ?? []) {
      if (seen.has(c)) continue;
      seen.add(c);
      tiles.push({ id: c, depth });
      walk(c, depth + 1);
    }
  };
  walk(id, 1);
  return tiles;
}
