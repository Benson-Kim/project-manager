import type { CanvasItem, CanvasLink } from "../schemas/canvas";
import { itemKey } from "./gaps";

const keyOf = (item: CanvasItem) => itemKey(item.Kind, item.ItemId);
const parentKey = (item: CanvasItem) =>
  item.ParentId === null ? null : itemKey(item.Kind, item.ParentId);
const linkEnds = (link: CanvasLink) =>
  [itemKey(link.UpstreamKind, link.UpstreamId), itemKey("Requirement", link.DownstreamId)] as const;

export interface CollapsedView {
  /** On-canvas item key to the topmost collapsed ancestor that stands in for it. */
  hiddenBy: ReadonlyMap<string, string>;
  /** Collapsed item key to how many on-canvas items it hides. */
  hiddenCount: ReadonlyMap<string, number>;
}

/** A collapsed node on the canvas hides every on-canvas item below it in its own parent tree. */
export function collapsedView(items: readonly CanvasItem[]): CollapsedView {
  const byKey = new Map(items.map((item) => [keyOf(item), item]));
  const hiddenBy = new Map<string, string>();
  const hiddenCount = new Map<string, number>();
  for (const item of items) {
    if (!item.OnCanvas) continue;
    const seen = new Set([keyOf(item)]);
    let top: string | null = null;
    for (let up = parentKey(item); up && !seen.has(up);) {
      seen.add(up);
      const parent = byKey.get(up);
      if (!parent) break;
      if (parent.OnCanvas && parent.IsCollapsed) top = up;
      up = parentKey(parent);
    }
    if (!top) continue;
    hiddenBy.set(keyOf(item), top);
    hiddenCount.set(top, (hiddenCount.get(top) ?? 0) + 1);
  }
  return { hiddenBy, hiddenCount };
}

export interface FoldedLink {
  source: string;
  target: string;
  links: CanvasLink[];
}

/** Links redrawn between the nodes still shown: one per pair, none inside a collapsed tree. */
export function foldLinks(
  links: readonly CanvasLink[],
  hiddenBy: ReadonlyMap<string, string>,
): FoldedLink[] {
  const folded = new Map<string, FoldedLink>();
  for (const link of links) {
    const [up, down] = linkEnds(link);
    const source = hiddenBy.get(up) ?? up;
    const target = hiddenBy.get(down) ?? down;
    if (source === target) continue;
    const id = `${source}>${target}`;
    const pair = folded.get(id) ?? { source, target, links: [] };
    pair.links.push(link);
    folded.set(id, pair);
  }
  return [...folded.values()];
}

/**
 * The focus with what lies up to `depth` links upstream and downstream of it. The walk keeps one
 * direction, so a sibling sharing a parent is not a neighbour. Infinity gives the whole trace.
 */
export function neighbourhood(
  focus: string,
  links: readonly CanvasLink[],
  depth = 1,
): ReadonlySet<string> {
  const ups = new Map<string, string[]>();
  const downs = new Map<string, string[]>();
  for (const link of links) {
    const [up, down] = linkEnds(link);
    ups.set(down, [...(ups.get(down) ?? []), up]);
    downs.set(up, [...(downs.get(up) ?? []), down]);
  }
  const found = new Set([focus]);
  for (const next of [ups, downs]) {
    const reached = new Set([focus]);
    let ring = [focus];
    for (let step = 0; step < depth && ring.length > 0; step++) {
      ring = ring.flatMap((key) => next.get(key) ?? []).filter((key) => !reached.has(key));
      for (const key of ring) reached.add(key);
    }
    for (const key of reached) found.add(key);
  }
  return found;
}

/**
 * Each item's cluster: the top-level WBS item it traces to. A WBS item climbs its own parents; a
 * requirement walks upstream through its links and its parent to the nearest WBS item, the first
 * in item order on a tie, since the server sends WBS order. Null means it traces to none.
 */
export function canvasClusters(
  items: readonly CanvasItem[],
  links: readonly CanvasLink[],
): ReadonlyMap<string, string | null> {
  const byKey = new Map(items.map((item) => [keyOf(item), item]));
  const order = new Map(items.map((item, index) => [keyOf(item), index]));
  const ups = new Map<string, string[]>();
  for (const link of links) {
    const [up, down] = linkEnds(link);
    ups.set(down, [...(ups.get(down) ?? []), up]);
  }

  const wbsRoot = (start: string) => {
    const seen = new Set<string>();
    let key = start;
    for (let item = byKey.get(key); item && !seen.has(key); item = byKey.get(key)) {
      seen.add(key);
      const up = parentKey(item);
      if (!up || !byKey.has(up)) break;
      key = up;
    }
    return key;
  };

  const nearestWbs = (start: string) => {
    const reached = new Set([start]);
    let ring = [start];
    while (ring.length > 0) {
      const hits = ring.filter((key) => byKey.get(key)?.Kind === "Wbs");
      if (hits.length > 0) {
        return hits.reduce((a, b) => ((order.get(a) ?? 0) <= (order.get(b) ?? 0) ? a : b));
      }
      ring = ring
        .flatMap((key) => {
          const item = byKey.get(key);
          const parent = item ? parentKey(item) : null;
          return [...(ups.get(key) ?? []), ...(parent ? [parent] : [])];
        })
        .filter((key) => !reached.has(key) && byKey.has(key));
      for (const key of ring) reached.add(key);
    }
    return null;
  };

  return new Map(
    items.map((item) => {
      const wbs = nearestWbs(keyOf(item));
      return [keyOf(item), wbs === null ? null : wbsRoot(wbs)];
    }),
  );
}
