import type { CSSProperties } from "react";
import type { DropZone, Wbs } from "../schemas/wbs";

/**
 * Geometry for the WBS diagram (ADR-0027 §8): which branches sit side by side
 * so the chart fits its width, how big that makes it, the zoom steps, the
 * viewer's saved settings, and which part of a box a dragged item is over.
 */

export const WBS_VIEWS = ["wbs", "gantt"] as const;
export type WbsView = (typeof WBS_VIEWS)[number];

export function isWbsView(value: unknown): value is WbsView {
  return typeof value === "string" && (WBS_VIEWS as readonly string[]).includes(value);
}

/** How a parent shows its sub-items: side by side under it, or listed below it. */
export type BranchLayout = "row" | "list";

/**
 * The chart's geometry in rem. The markup reads it as CSS variables and the
 * layout below as numbers, so the two cannot drift apart.
 */
export const CHART_REM = {
  /** A box's width. */
  box: 13,
  /** A box's least height. */
  boxMin: 3.5,
  /** Each side of a box among others side by side (half the space between two). */
  gap: 0.75,
  /** A line's length: up from a box to its siblings' line, down from a parent. */
  link: 1.5,
  /** A list's rail, in from the left edge of its parent's box. */
  rail: 1,
  /** From the rail to a listed box. */
  tick: 1,
  /** Above each listed box. */
  listGap: 0.75,
} as const;

/** CHART_REM as the CSS variables the diagram's classes use (--wbs-box, …). */
export function chartVariables(): CSSProperties {
  const r = CHART_REM;
  return {
    "--wbs-box": `${r.box}rem`,
    "--wbs-box-min": `${r.boxMin}rem`,
    "--wbs-gap": `${r.gap}rem`,
    "--wbs-link": `${r.link}rem`,
    "--wbs-rail": `${r.rail}rem`,
    "--wbs-tick": `${r.tick}rem`,
    "--wbs-list-gap": `${r.listGap}rem`,
    "--wbs-tick-y": `${r.listGap + r.boxMin / 2}rem`,
  } as CSSProperties;
}

/** The chart's geometry in CSS pixels. */
export interface ChartPx {
  /** A box with its gaps, side by side with others. */
  slot: number;
  /** How far each listed level steps in. */
  step: number;
  link: number;
  listGap: number;
  /** A box's height. */
  box: number;
}

/** CHART_REM at the page's root font size; `boxHeight` is the tallest box when it is known. */
export function chartPx(rem: number, boxHeight?: number): ChartPx {
  const r = CHART_REM;
  return {
    slot: (r.box + 2 * r.gap) * rem,
    step: (r.rail + r.tick) * rem,
    link: r.link * rem,
    listGap: r.listGap * rem,
    box: Math.max(boxHeight ?? 0, r.boxMin * rem),
  };
}

function isOpen(wbs: Wbs, collapsed: ReadonlySet<number>, id: number): boolean {
  return (wbs.nodes.get(id)?.childIds.length ?? 0) > 0 && !collapsed.has(id);
}

/** The levels a branch shows when it is listed: 1 for an item whose sub-items are not shown. */
function shownLevels(wbs: Wbs, collapsed: ReadonlySet<number>): Map<number, number> {
  const levels = new Map<number, number>();
  for (let i = wbs.order.length - 1; i >= 0; i--) {
    const id = wbs.order[i]!;
    const kids = isOpen(wbs, collapsed, id) ? wbs.nodes.get(id)!.childIds : [];
    levels.set(id, 1 + Math.max(0, ...kids.map((kid) => levels.get(kid) ?? 1)));
  }
  return levels;
}

function measurer(
  wbs: Wbs,
  collapsed: ReadonlySet<number>,
  rows: ReadonlySet<number>,
  px: ChartPx,
) {
  const levels = shownLevels(wbs, collapsed);
  const open = (id: number) => isOpen(wbs, collapsed, id);
  const kids = (id: number) => wbs.nodes.get(id)!.childIds;
  const width = (id: number): number => {
    if (!open(id)) return px.slot;
    if (!rows.has(id)) return px.slot + px.step * (levels.get(id)! - 1);
    return kids(id).reduce((sum, kid) => sum + width(kid), 0);
  };
  // Every shown branch hangs a line's length below its parent's box, where its switch sits.
  const listHeight = (id: number): number =>
    kids(id).reduce(
      (sum, kid) => sum + px.listGap + px.box + (open(kid) ? px.link + listHeight(kid) : 0),
      0,
    );
  const height = (id: number): number => {
    const own = px.link + px.box;
    if (!open(id)) return own;
    if (!rows.has(id)) return own + px.link + listHeight(id);
    return own + px.link + Math.max(...kids(id).map(height));
  };
  return {
    width,
    total: () => wbs.rootIds.reduce((sum, id) => sum + width(id), 0),
    height: () => Math.max(0, ...wbs.rootIds.map(height)),
  };
}

function ancestorsOf(wbs: Wbs, id: number): number[] {
  const out: number[] = [];
  for (let p = wbs.nodes.get(id)?.parentId ?? null; p !== null; p = wbs.nodes.get(p)!.parentId) {
    out.push(p);
  }
  return out;
}

/**
 * The parents whose sub-items sit side by side; every other branch on screen
 * is listed below its parent. The top-level items always sit side by side
 * under the project. A branch the viewer set to "row" is side by side, and so
 * are the branches above it; one set to "list" is listed. The rest are opened
 * up level by level, the cheapest first, while the chart still fits
 * `available` pixels, so small branches sit side by side and big ones are
 * listed.
 */
export function branchRows(
  wbs: Wbs,
  collapsed: ReadonlySet<number>,
  choices: ReadonlyMap<number, BranchLayout>,
  available: number,
  px: ChartPx,
): Set<number> {
  const rows = new Set<number>();
  for (const [id, choice] of choices) {
    if (choice !== "row" || !wbs.nodes.get(id)?.childIds.length) continue;
    const above = ancestorsOf(wbs, id);
    if (above.some((a) => choices.get(a) === "list")) continue;
    for (const a of [id, ...above]) rows.add(a);
  }
  const measure = measurer(wbs, collapsed, rows, px);
  const open = (id: number) => isOpen(wbs, collapsed, id);

  let level = wbs.rootIds.filter(open);
  while (level.length > 0) {
    const cost = new Map<number, number>();
    for (const id of level) {
      if (rows.has(id) || choices.get(id) === "list") continue;
      const listed = measure.width(id);
      rows.add(id);
      cost.set(id, measure.width(id) - listed);
      rows.delete(id);
    }
    for (const id of [...cost.keys()].sort((a, b) => cost.get(a)! - cost.get(b)!)) {
      rows.add(id);
      // Side by side costs nothing for a branch no wider than its list (one sub-item).
      if (cost.get(id)! > 0 && measure.total() > available) rows.delete(id);
    }
    level = level
      .filter((id) => rows.has(id))
      .flatMap((id) => wbs.nodes.get(id)!.childIds.filter(open));
  }
  return rows;
}

/** The size of the top-level row and everything under it (not the project box or padding). */
export function chartSize(
  wbs: Wbs,
  collapsed: ReadonlySet<number>,
  rows: ReadonlySet<number>,
  px: ChartPx,
): { width: number; height: number } {
  const measure = measurer(wbs, collapsed, rows, px);
  return { width: measure.total(), height: measure.height() };
}

/**
 * The choices after the viewer sets a branch: "row" also clears a "list" on
 * the branches above it (they open up for it), "list" also clears a "row"
 * below it (it would reopen this one), and "auto" forgets the choice.
 */
export function chooseBranch(
  wbs: Wbs,
  choices: ReadonlyMap<number, BranchLayout>,
  id: number,
  layout: BranchLayout | "auto",
): Map<number, BranchLayout> {
  const next = new Map(choices);
  if (layout === "auto") {
    next.delete(id);
    return next;
  }
  next.set(id, layout);
  if (layout === "row") {
    for (const a of ancestorsOf(wbs, id)) if (next.get(a) === "list") next.delete(a);
  } else {
    for (const [other, choice] of choices) {
      if (choice === "row" && ancestorsOf(wbs, other).includes(id)) next.delete(other);
    }
  }
  return next;
}

export const ZOOM_STEPS = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5] as const;

/** The next zoom step in or out from `zoom`, or `zoom` itself at either end. */
export function zoomStep(zoom: number, direction: 1 | -1): number {
  const steps = direction === 1 ? ZOOM_STEPS : [...ZOOM_STEPS].reverse();
  return steps.find((step) => (direction === 1 ? step > zoom : step < zoom)) ?? zoom;
}

/** The largest zoom, at most actual size, at which `fits`; the smallest step when none does. */
export function fitZoom(fits: (zoom: number) => boolean): number {
  const smaller = ZOOM_STEPS.filter((step) => step <= 1).reverse();
  return smaller.find(fits) ?? ZOOM_STEPS[0];
}

/** What a viewer set on a project's chart, kept in their browser like the collapsed branches. */
export interface ChartSettings {
  /** The width the chart lays itself out in, in screen pixels; null is its view's width. */
  width: number | null;
  zoom: number;
  /** Branches set side by side or listed; the others follow the width. */
  branches: ReadonlyMap<number, BranchLayout>;
}

export const DEFAULT_CHART: ChartSettings = { width: null, zoom: 1, branches: new Map() };

/** Saved settings as stored, refusing anything malformed piece by piece. */
export function parseChartSettings(raw: unknown): ChartSettings {
  if (typeof raw !== "object" || raw === null) return DEFAULT_CHART;
  const { width, zoom, branches } = raw as Record<string, unknown>;
  const pairs = Array.isArray(branches) ? branches : [];
  return {
    width: typeof width === "number" && Number.isFinite(width) && width > 0 ? width : null,
    zoom: ZOOM_STEPS.find((step) => step === zoom) ?? 1,
    branches: new Map(
      pairs.filter(
        (pair): pair is [number, BranchLayout] =>
          Array.isArray(pair) &&
          Number.isInteger(pair[0]) &&
          (pair[1] === "row" || pair[1] === "list"),
      ),
    ),
  };
}

export function serializeChartSettings(settings: ChartSettings): string {
  return JSON.stringify({
    width: settings.width,
    zoom: settings.zoom,
    branches: [...settings.branches],
  });
}

/** Where boxes are laid out where the pointer is: side by side, listed, or the project box. */
export type DropAxis = "row" | "column" | "root";

/** The share of a box, from each edge, that drops in front of it or behind it. */
const EDGE_SHARE = 0.3;

/**
 * The zone under the pointer: near the leading edge drops in front of the
 * box, near the trailing edge behind it, and the middle makes the dragged
 * item its last sub-item. Leading and trailing are left and right side by
 * side, top and bottom in a list; the project box only takes items.
 */
export function dropZoneAt(
  box: { left: number; top: number; width: number; height: number },
  x: number,
  y: number,
  axis: DropAxis,
): DropZone {
  if (axis === "root") return "into";
  const share =
    axis === "row"
      ? (x - box.left) / Math.max(box.width, 1)
      : (y - box.top) / Math.max(box.height, 1);
  if (share < EDGE_SHARE) return "before";
  if (share > 1 - EDGE_SHARE) return "after";
  return "into";
}

/** The fastest the diagram scrolls while a box is dragged near its edge, in pixels per frame. */
const MAX_EDGE_SCROLL = 20;

/** Pixels per frame the diagram scrolls by while a box is dragged near (or past) its edge. */
export function edgeScroll(pointer: number, start: number, end: number, margin = 40): number {
  if (pointer < start + margin) {
    return -Math.min(MAX_EDGE_SCROLL, Math.ceil((start + margin - pointer) / 4));
  }
  if (pointer > end - margin) {
    return Math.min(MAX_EDGE_SCROLL, Math.ceil((pointer - (end - margin)) / 4));
  }
  return 0;
}
