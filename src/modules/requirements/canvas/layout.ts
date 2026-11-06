import type { CanvasItem, CanvasLink } from "../schemas/canvas";
import { itemKey } from "./gaps";

export const NODE_WIDTH = 240;
export const NODE_HEIGHT = 150;
const COLUMN_STEP = NODE_WIDTH + 96;
const ROW_STEP = NODE_HEIGHT + 24;

export interface Point {
  x: number;
  y: number;
}

type LayoutItem = Pick<CanvasItem, "Kind" | "ItemId" | "Ref">;
type LayoutLink = Pick<CanvasLink, "UpstreamKind" | "UpstreamId" | "DownstreamId">;
type Neighbours = Map<string, string[]>;

const add = (map: Neighbours, key: string, value: string) =>
  map.set(key, [...(map.get(key) ?? []), value]);

/** Longest path from upstream, so a link that skips a level still points right. */
function ranksOf(keys: readonly string[], above: Neighbours, below: Neighbours) {
  const rank = new Map(keys.map((key) => [key, 0]));
  const waiting = new Map(keys.map((key) => [key, above.get(key)?.length ?? 0]));
  const queue = keys.filter((key) => waiting.get(key) === 0);
  for (const key of queue) {
    for (const next of below.get(key) ?? []) {
      rank.set(next, Math.max(rank.get(next) ?? 0, (rank.get(key) ?? 0) + 1));
      const left = (waiting.get(next) ?? 0) - 1;
      waiting.set(next, left);
      if (left === 0) queue.push(next);
    }
  }
  return rank;
}

const slot = (index: number, size: number) => index - (size - 1) / 2;

/** Orders each column by the average slot of its neighbours in the columns already swept. */
function sweep(columns: string[][], neighbours: Neighbours) {
  const slots = new Map<string, number>();
  for (const column of columns) {
    const scored = column.map((key, index) => {
      const seen = (neighbours.get(key) ?? []).flatMap((n) => slots.get(n) ?? []);
      const score = seen.length
        ? seen.reduce((sum, value) => sum + value, 0) / seen.length
        : slot(index, column.length);
      return { key, score };
    });
    scored.sort((a, b) => a.score - b.score);
    scored.forEach(({ key }, index) => {
      column[index] = key;
      slots.set(key, slot(index, column.length));
    });
  }
}

/** Auto layout (ADR-0061 section 5): left to right, upstream first. Links off the canvas are ignored. */
export function layoutCanvas(
  items: readonly LayoutItem[],
  links: readonly LayoutLink[],
): Map<string, Point> {
  const keys = [...items]
    .sort((a, b) => a.Ref.localeCompare(b.Ref, undefined, { numeric: true }))
    .map((item) => itemKey(item.Kind, item.ItemId));
  const onCanvas = new Set(keys);
  const above: Neighbours = new Map();
  const below: Neighbours = new Map();
  for (const link of links) {
    const upstream = itemKey(link.UpstreamKind, link.UpstreamId);
    const downstream = itemKey("Requirement", link.DownstreamId);
    if (!onCanvas.has(upstream) || !onCanvas.has(downstream)) continue;
    add(below, upstream, downstream);
    add(above, downstream, upstream);
  }

  const rank = ranksOf(keys, above, below);
  const columns: string[][] = [];
  for (const key of keys) (columns[rank.get(key) ?? 0] ??= []).push(key);
  const filled = columns.filter(Boolean);

  sweep(filled, above);
  sweep(filled.toReversed(), below);
  sweep(filled, above);

  const points = new Map<string, Point>();
  filled.forEach((column, index) =>
    column.forEach((key, row) =>
      points.set(key, {
        x: index * COLUMN_STEP,
        y: Math.round(slot(row, column.length) * ROW_STEP),
      }),
    ),
  );
  return points;
}
