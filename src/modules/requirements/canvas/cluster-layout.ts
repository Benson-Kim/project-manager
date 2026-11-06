import type { CanvasItem, CanvasLink } from "../schemas/canvas";
import { itemKey } from "./gaps";
import { layoutCanvas, NODE_HEIGHT, type Point } from "./layout";

const CLUSTER_GAP = 72;

export interface ClusterBand {
  cluster: string | null;
  top: number;
  bottom: number;
}

export interface ClusterLayout {
  points: Map<string, Point>;
  bands: ClusterBand[];
}

/**
 * Auto layout one cluster at a time, each in its own band below the last: WBS order first, items
 * with no cluster at the end. Links between clusters still draw; they only do not shape a band.
 */
export function layoutClusters(
  items: readonly CanvasItem[],
  links: readonly CanvasLink[],
  clusters: ReadonlyMap<string, string | null>,
): ClusterLayout {
  const order = new Map(items.map((item, index) => [itemKey(item.Kind, item.ItemId), index]));
  const groups = new Map<string | null, CanvasItem[]>();
  for (const item of items) {
    const cluster = clusters.get(itemKey(item.Kind, item.ItemId)) ?? null;
    groups.set(cluster, [...(groups.get(cluster) ?? []), item]);
  }
  const rank = (cluster: string | null) =>
    cluster === null ? items.length + 1 : (order.get(cluster) ?? items.length);
  const sorted = [...groups].sort(([a], [b]) => rank(a) - rank(b));

  const points = new Map<string, Point>();
  const bands: ClusterBand[] = [];
  let cursor = 0;
  for (const [cluster, members] of sorted) {
    const local = layoutCanvas(members, links);
    const ys = [...local.values()].map((point) => point.y);
    const shift = cursor - Math.min(...ys);
    for (const [key, point] of local) points.set(key, { x: point.x, y: point.y + shift });
    const bottom = Math.max(...ys) + shift + NODE_HEIGHT;
    bands.push({ cluster, top: cursor, bottom });
    cursor = bottom + CLUSTER_GAP;
  }
  return { points, bands };
}
