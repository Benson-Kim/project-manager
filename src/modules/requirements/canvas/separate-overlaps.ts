import { resolvedNodeSize, type NodeBox } from "./board-model";
import type { Point } from "./layout";

export type OverlapNode = NodeBox & { id: string };

export interface SeparateOverlapsOptions {
  /** Minimum clear gap left between cards that had to be separated. Default: 24. */
  gap?: number;
  /** Maximum iterative relaxation passes before deterministic free-slot fallback. Default: 100. */
  maxIterations?: number;
}

interface Box {
  index: number;
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  movable: boolean;
  /** A hidden card: an obstacle that never moves and that no moved card may land on. */
  hidden: boolean;
}

const DEFAULT_GAP = 24;
const DEFAULT_MAX_ITERATIONS = 100;
const INT32_MIN = -(2 ** 31);
const INT32_MAX = 2 ** 31 - 1;

function clampInt32(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(Math.max(INT32_MIN, Math.min(INT32_MAX, value)));
  return rounded === 0 ? 0 : rounded;
}

function compareByX(a: Box, b: Box): number {
  return a.x - b.x || a.y - b.y || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) || a.index - b.index;
}

function compareById(a: Box, b: Box): number {
  return (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) || a.index - b.index;
}

type Rect = Pick<Box, "x" | "y" | "w" | "h">;

function overlapArea(a: Rect, b: Rect): { x: number; y: number } | null {
  const x = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  if (x <= 0) return null;
  const y = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (y <= 0) return null;
  return { x, y };
}

function toBoxes(nodes: readonly OverlapNode[]): Box[] {
  const boxes: Box[] = [];
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]!;
    const { width, height } = resolvedNodeSize(node);
    boxes.push({
      index,
      id: node.id,
      x: clampInt32(node.position.x),
      y: clampInt32(node.position.y),
      w: width,
      h: height,
      movable: false,
      hidden: node.hidden === true,
    });
  }
  return boxes;
}

function markInitialOverlaps(boxes: Box[]): boolean {
  const sorted = [...boxes].sort(compareByX);
  let any = false;
  for (let i = 0; i < sorted.length; i += 1) {
    const a = sorted[i]!;
    if (a.hidden) continue;
    for (let j = i + 1; j < sorted.length; j += 1) {
      const b = sorted[j]!;
      if (b.x >= a.x + a.w) break;
      if (!b.hidden && overlapArea(a, b)) {
        a.movable = true;
        b.movable = true;
        any = true;
      }
    }
  }
  return any;
}

function pushApart(a: Box, b: Box, overlap: { x: number; y: number }, gap: number) {
  const wA = a.movable && !b.movable ? 1 : !a.movable && b.movable ? 0 : 0.5;
  const horizontal = overlap.x < overlap.y;
  const push = Math.ceil(horizontal ? overlap.x : overlap.y) + gap;
  const moveA = Math.round(push * wA);
  const moveB = push - moveA;

  if (horizontal) {
    const dx = a.x + a.w / 2 - (b.x + b.w / 2);
    const sign = dx === 0 ? -1 : Math.sign(dx);
    a.x = clampInt32(a.x + sign * moveA);
    b.x = clampInt32(b.x - sign * moveB);
    return;
  }
  const dy = a.y + a.h / 2 - (b.y + b.h / 2);
  const sign = dy === 0 ? -1 : Math.sign(dy);
  a.y = clampInt32(a.y + sign * moveA);
  b.y = clampInt32(b.y - sign * moveB);
}

function relaxOverlaps(boxes: Box[], gap: number, maxIterations: number) {
  const ordered = [...boxes].sort(compareById);
  const limit = ordered.length > 300 ? Math.min(maxIterations, 20) : maxIterations;
  for (let pass = 0; pass < limit; pass += 1) {
    let moved = false;
    for (let i = 0; i < ordered.length; i += 1) {
      const a = ordered[i]!;
      for (let j = i + 1; j < ordered.length; j += 1) {
        const b = ordered[j]!;
        if (!a.movable && !b.movable) continue;
        const overlap = overlapArea(a, b);
        if (!overlap) continue;
        pushApart(a, b, overlap, gap);
        moved = true;
      }
    }
    if (!moved) break;
  }
}

interface PlacedSet {
  byX: Box[];
  maxW: number;
}

function partitionPoint(sorted: readonly Box[], isBefore: (box: Box) => boolean): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (isBefore(sorted[mid]!)) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function overlapsPlaced(cand: Rect, { byX, maxW }: PlacedSet): boolean {
  // Binary search first placed box whose right edge can exceed cand.x.
  const minX = cand.x - maxW;
  for (let i = partitionPoint(byX, (other) => other.x <= minX); i < byX.length; i += 1) {
    const other = byX[i]!;
    if (other.x >= cand.x + cand.w) break;
    if (overlapArea(cand, other)) return true;
  }
  return false;
}

function place(placed: PlacedSet, box: Box) {
  const at = partitionPoint(placed.byX, (other) => compareByX(other, box) <= 0);
  placed.byX.splice(at, 0, box);
  placed.maxW = Math.max(placed.maxW, box.w);
}

function ringOffsets(ring: number): Array<[number, number]> {
  const offsets: Array<[number, number]> = [];
  for (let gy = -ring; gy <= ring; gy += 1) {
    for (let gx = -ring; gx <= ring; gx += 1) {
      if (Math.max(Math.abs(gx), Math.abs(gy)) === ring) offsets.push([gx, gy]);
    }
  }
  offsets.sort(
    ([ax, ay], [bx, by]) => ax * ax + ay * ay - (bx * bx + by * by) || ay - by || ax - bx,
  );
  return offsets;
}

/** A spot on the box's own row beyond every placed box: right of them all, else left of them all. */
function slotBesideAll(box: Box, placed: readonly Box[], gap: number): Point {
  let left = Infinity;
  let right = -Infinity;
  for (const other of placed) {
    left = Math.min(left, other.x);
    right = Math.max(right, other.x + other.w);
  }
  const afterRight = Math.ceil(right + gap);
  const x = afterRight <= INT32_MAX ? afterRight : Math.floor(left - gap - box.w);
  return { x: clampInt32(x), y: box.y };
}

function resolveResidualOverlaps(boxes: Box[], gap: number) {
  const placed: PlacedSet = { byX: [], maxW: 0 };
  for (const box of [...boxes].filter((b) => !b.movable).sort(compareByX)) {
    place(placed, box);
  }
  const pending: Box[] = [];
  for (const box of [...boxes].filter((b) => b.movable).sort(compareById)) {
    if (!overlapsPlaced(box, placed)) {
      place(placed, box);
    } else {
      pending.push(box);
    }
  }
  if (pending.length === 0) return;

  const ringCache = new Map<number, Array<[number, number]>>();
  for (const box of pending) {
    const stepX = Math.max(1, Math.round(box.w + gap));
    const stepY = Math.max(1, Math.round(box.h + gap));
    const maxRings = placed.byX.length + 2;
    let found: Point | null = null;
    for (let ring = 1; ring <= maxRings && !found; ring += 1) {
      let offsets = ringCache.get(ring);
      if (!offsets) {
        offsets = ringOffsets(ring);
        ringCache.set(ring, offsets);
      }
      for (const [gx, gy] of offsets) {
        const rawX = box.x + gx * stepX;
        const rawY = box.y + gy * stepY;
        if (rawX < INT32_MIN || rawX > INT32_MAX || rawY < INT32_MIN || rawY > INT32_MAX) {
          continue;
        }
        const cx = clampInt32(rawX);
        const cy = clampInt32(rawY);
        if (!overlapsPlaced({ x: cx, y: cy, w: box.w, h: box.h }, placed)) {
          found = { x: cx, y: cy };
          break;
        }
      }
    }
    const slot = found ?? slotBesideAll(box, placed.byX, gap);
    box.x = slot.x;
    box.y = slot.y;
    place(placed, box);
  }
}

/** True when any two non-hidden cards strictly intersect (`overlapX > 0 && overlapY > 0`). */
export function hasOverlaps(nodes: readonly OverlapNode[]): boolean {
  const boxes = toBoxes(nodes);
  if (boxes.length < 2) return false;
  return markInitialOverlaps(boxes);
}

/**
 * Non-destructively nudges overlapping cards apart while preserving non-overlapping manual
 * placements. Hidden cards are fixed obstacles: they never move, and no card that moves ends on
 * one. Deterministic regardless of input order; guarantees no overlaps between visible cards and
 * int32 whole-number coordinates for every visible card on output.
 */
export function separateOverlaps<T extends OverlapNode>(
  nodes: readonly T[],
  options?: SeparateOverlapsOptions,
): T[] {
  if (nodes.length === 0) return [];
  const gap =
    typeof options?.gap === "number" && Number.isFinite(options.gap) && options.gap >= 0
      ? Math.round(options.gap)
      : DEFAULT_GAP;
  const maxIterations =
    typeof options?.maxIterations === "number" &&
    Number.isFinite(options.maxIterations) &&
    options.maxIterations >= 1
      ? Math.floor(options.maxIterations)
      : DEFAULT_MAX_ITERATIONS;

  const boxes = toBoxes(nodes);
  if (markInitialOverlaps(boxes)) {
    relaxOverlaps(boxes, gap, maxIterations);
    resolveResidualOverlaps(boxes, gap);
  }

  return nodes.map((node, index) => {
    const box = boxes[index]!;
    if (box.hidden) return node;
    if (Object.is(node.position.x, box.x) && Object.is(node.position.y, box.y)) return node;
    return { ...node, position: { x: box.x, y: box.y } };
  });
}

/** Position updates for non-hidden nodes whose coordinates changed after separation. */
export function separationMoves(
  before: readonly OverlapNode[],
  after: readonly OverlapNode[],
): Array<{ id: string } & Point> {
  const previous = new Map(before.map((node) => [node.id, node.position]));
  const moves: Array<{ id: string } & Point> = [];
  for (const node of after) {
    if (node.hidden) continue;
    const prev = previous.get(node.id);
    if (!prev || !Object.is(prev.x, node.position.x) || !Object.is(prev.y, node.position.y)) {
      moves.push({ id: node.id, x: node.position.x, y: node.position.y });
    }
  }
  return moves;
}

export function capMoves<T>(moves: readonly T[], cap: number): { batch: T[]; capped: boolean } {
  return { batch: moves.slice(0, cap), capped: moves.length > cap };
}
