import type { CanvasItem, CanvasLink } from "../schemas/canvas";

export interface CanvasGaps {
  missingTest: boolean;
  noDownstream: boolean;
}

export const itemKey = (kind: CanvasItem["Kind"], id: number) => `${kind}:${id}`;

const NO_GAPS: CanvasGaps = { missingTest: false, noDownstream: false };

/**
 * Gaps per item, from Active links only. A test further down covers everything above it.
 * Gaps inform and never block.
 */
export function canvasGaps(
  items: readonly CanvasItem[],
  links: readonly CanvasLink[],
): Map<string, CanvasGaps> {
  const below = new Map<string, string[]>();
  for (const link of links) {
    if (link.LinkStatus !== "Active") continue;
    const upstream = itemKey(link.UpstreamKind, link.UpstreamId);
    below.set(upstream, [
      ...(below.get(upstream) ?? []),
      itemKey("Requirement", link.DownstreamId),
    ]);
  }

  const tests = new Set(
    items.filter((item) => item.Type === "TC").map((item) => itemKey(item.Kind, item.ItemId)),
  );
  const reachesTest = new Map<string, boolean>();
  const covered = (key: string): boolean => {
    const known = reachesTest.get(key);
    if (known !== undefined) return known;
    reachesTest.set(key, false);
    const result = (below.get(key) ?? []).some((next) => tests.has(next) || covered(next));
    reachesTest.set(key, result);
    return result;
  };

  return new Map(
    items.map((item) => {
      const key = itemKey(item.Kind, item.ItemId);
      if (tests.has(key)) return [key, NO_GAPS];
      return [key, { missingTest: !covered(key), noDownstream: !below.has(key) }];
    }),
  );
}
