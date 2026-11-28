import { groupInOrder } from "@/lib/group-in-order";
import type { CanvasItem, CanvasLink } from "../schemas/canvas";
import { typeOrder, type RequirementType } from "../schemas/requirement-types";
import { itemKey } from "./gaps";

export const LANES_BY = ["type", "owner"] as const;
export type LanesBy = (typeof LANES_BY)[number];

export interface WalkthroughCard {
  item: CanvasItem;
  /** How many links lead to it from a starting item: the column it reads in. */
  step: number;
}

export interface WalkthroughLane {
  key: string;
  /** The type or owner name; null for the lane of items with no owner. */
  label: string | null;
  cards: WalkthroughCard[];
}

const laneOrder = (item: CanvasItem) =>
  item.Type === "WBS" ? -1 : typeOrder(item.Type as RequirementType);

/** The step of each item: the longest chain of links reaching it from items nothing leads to. */
export function walkthroughSteps(
  items: readonly CanvasItem[],
  links: readonly CanvasLink[],
): ReadonlyMap<string, number> {
  const keys = new Set(items.map((item) => itemKey(item.Kind, item.ItemId)));
  const upstream = new Map<string, string[]>();
  for (const link of links) {
    const up = itemKey(link.UpstreamKind, link.UpstreamId);
    const down = itemKey("Requirement", link.DownstreamId);
    if (!keys.has(up) || !keys.has(down) || up === down) continue;
    upstream.set(down, [...(upstream.get(down) ?? []), up]);
  }
  const steps = new Map<string, number>();
  const visiting = new Set<string>();
  const stepOf = (key: string): number => {
    const known = steps.get(key);
    if (known !== undefined) return known;
    if (visiting.has(key)) return 0;
    visiting.add(key);
    const step = Math.max(-1, ...(upstream.get(key) ?? []).map(stepOf)) + 1;
    visiting.delete(key);
    steps.set(key, step);
    return step;
  };
  for (const key of keys) stepOf(key);
  return steps;
}

/**
 * The items on the canvas as swim lanes: one lane per type (in canvas order) or per owner
 * (by name, no owner last). Cards read left to right by step, then by where they sit on the canvas.
 */
export function walkthroughLanes(
  items: readonly CanvasItem[],
  links: readonly CanvasLink[],
  by: LanesBy,
  ownerOf: (item: CanvasItem) => string | null = () => null,
): WalkthroughLane[] {
  const placed = items.filter((item) => item.OnCanvas);
  const steps = walkthroughSteps(placed, links);
  const cards = placed
    .map((item) => ({ item, step: steps.get(itemKey(item.Kind, item.ItemId)) ?? 0 }))
    .sort(
      (a, b) =>
        a.step - b.step ||
        (a.item.X ?? 0) - (b.item.X ?? 0) ||
        (a.item.Y ?? 0) - (b.item.Y ?? 0) ||
        a.item.Ref.localeCompare(b.item.Ref, undefined, { numeric: true }),
    );
  if (by === "type") {
    return groupInOrder(cards, (card) => card.item.Type)
      .sort((a, b) => laneOrder(a.rows[0].item) - laneOrder(b.rows[0].item))
      .map((group) => ({ key: `type:${group.key}`, label: group.key, cards: group.rows }));
  }
  return groupInOrder(cards, (card) => ownerOf(card.item)?.trim() || null)
    .sort(
      (a, b) =>
        Number(a.key === null) - Number(b.key === null) ||
        (a.key ?? "").localeCompare(b.key ?? "", undefined, { sensitivity: "base" }),
    )
    .map((group) => ({ key: `owner:${group.key ?? ""}`, label: group.key, cards: group.rows }));
}
