import type { CanvasItem } from "../schemas/canvas";
import { REQUIREMENT_TYPES } from "../schemas/requirement-types";
import { itemKey, type CanvasGaps } from "./gaps";

export const CANVAS_TYPE_FILTERS = ["All", "WBS", ...REQUIREMENT_TYPES] as const;
export type CanvasTypeFilter = (typeof CANVAS_TYPE_FILTERS)[number];

export interface RepositoryFilter {
  query: string;
  type: CanvasTypeFilter;
  gapsOnly: boolean;
}

export function filterRepository(
  items: readonly CanvasItem[],
  gaps: ReadonlyMap<string, CanvasGaps>,
  { query, type, gapsOnly }: RepositoryFilter,
): CanvasItem[] {
  const needle = query.trim().toLowerCase();
  return items.filter((item) => {
    if (type !== "All" && item.Type !== type) return false;
    const gap = gaps.get(itemKey(item.Kind, item.ItemId));
    if (gapsOnly && !gap?.missingTest && !gap?.noDownstream) return false;
    if (!needle) return true;
    return [item.Ref, item.Title, item.Summary ?? ""].some((text) =>
      text.toLowerCase().includes(needle),
    );
  });
}
