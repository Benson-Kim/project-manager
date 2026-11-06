import type { CanvasSummary } from "../schemas/canvas";

/** Which canvases the picker lists: every one, those filed under no WBS item, or one WBS item's. */
export type WbsFilter = "all" | "unfiled" | number;

/** `?wbs=` as the page reads it. Anything it does not know lists every canvas. */
export function parseWbsFilter(raw: string | undefined): WbsFilter {
  if (raw === "unfiled") return "unfiled";
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : "all";
}

/** The `?wbs=` value that reads back as `filter`, or null to leave it off. */
export function wbsFilterParam(filter: WbsFilter): string | null {
  return filter === "all" ? null : String(filter);
}

export function filterCanvases(
  canvases: readonly CanvasSummary[],
  filter: WbsFilter,
): CanvasSummary[] {
  if (filter === "all") return [...canvases];
  const wanted = filter === "unfiled" ? null : filter;
  return canvases.filter((canvas) => canvas.KeyDeliverableId === wanted);
}

/**
 * The canvas to show. One asked for by id shows even when the filter leaves it out of the list,
 * so filing it elsewhere does not swap the board under the user; otherwise the first one listed.
 */
export function pickCanvas(
  canvases: readonly CanvasSummary[],
  listed: readonly CanvasSummary[],
  requested: string | undefined,
): CanvasSummary | null {
  return (
    canvases.find((canvas) => String(canvas.RequirementCanvasId) === requested) ?? listed[0] ?? null
  );
}

/** The WBS item a new canvas starts under: the one the list is filtered to, if any. */
export function defaultWbsFor(filter: WbsFilter): number | null {
  return typeof filter === "number" ? filter : null;
}
