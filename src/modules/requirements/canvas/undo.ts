import type { CanvasItem, CanvasLink } from "../schemas/canvas";
import type { LinkRule } from "../schemas/link-rules";
import { itemConnection, type Placement, type Placements } from "./board-model";
import { itemKey } from "./gaps";

/** What takes one board change back: the nodes as they were, the new link gone, the old link back. */
export type CanvasUndo =
  | { kind: "nodes"; before: Placements }
  | { kind: "unlink"; upKey: string; downId: number }
  | { kind: "relink"; upKey: string; downKey: string };

const placementOf = ({ OnCanvas, X, Y, IsCollapsed }: CanvasItem): Placement => ({
  OnCanvas,
  X,
  Y,
  IsCollapsed,
});

const same = (a: Placement, b: Placement) =>
  a.OnCanvas === b.OnCanvas && a.X === b.X && a.Y === b.Y && a.IsCollapsed === b.IsCollapsed;

/** The placements a write replaces, for the nodes it changes; null when it changes none. */
export function nodesBack(items: readonly CanvasItem[], changes: Placements): CanvasUndo | null {
  const before = new Map<string, Placement>();
  for (const item of items) {
    const key = itemKey(item.Kind, item.ItemId);
    const change = changes.get(key);
    const was = placementOf(item);
    if (change && !same(change, was)) before.set(key, was);
  }
  return before.size > 0 ? { kind: "nodes", before } : null;
}

export const unlinkBack = (link: CanvasLink): CanvasUndo => ({
  kind: "relink",
  upKey: itemKey(link.UpstreamKind, link.UpstreamId),
  downKey: itemKey("Requirement", link.DownstreamId),
});

export const linkBack = (up: CanvasItem, down: CanvasItem): CanvasUndo => ({
  kind: "unlink",
  upKey: itemKey(up.Kind, up.ItemId),
  downId: down.ItemId,
});

export function savedLink(
  links: readonly CanvasLink[],
  upKey: string,
  downId: number,
): CanvasLink | undefined {
  return links.find(
    (link) => itemKey(link.UpstreamKind, link.UpstreamId) === upKey && link.DownstreamId === downId,
  );
}

/** A step applies while one of its nodes is still listed, or its link can still go or come back. */
export function undoApplies(
  step: CanvasUndo,
  items: readonly CanvasItem[],
  links: readonly CanvasLink[],
  rules: readonly LinkRule[],
): boolean {
  if (step.kind === "unlink") return savedLink(links, step.upKey, step.downId) !== undefined;
  if (step.kind === "relink") {
    return itemConnection(items, links, rules, step.upKey, step.downKey) !== null;
  }
  return items.some((item) => step.before.has(itemKey(item.Kind, item.ItemId)));
}
