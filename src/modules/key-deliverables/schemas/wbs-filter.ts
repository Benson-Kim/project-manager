import { MOSCOW, type MoSCoW } from "@/modules/requirements/schemas/moscow";
import {
  SOLUTION_TYPES,
  type SolutionType,
} from "@/modules/requirements/schemas/requirement-types";
import type { Wbs, WbsItem, WbsRequirement } from "./wbs";

/**
 * Search and chip filters on the work breakdown. A requirement shows when its type chip and its
 * MoSCoW chip ("none" when it has no code) are on and its text or reference holds the search, or
 * when one of its sub-requirements shows. An item shows when its name holds the search, when one
 * of its requirements shows, or, with no search text, when it has no requirements; the items above
 * a shown item stay to keep its place. The breakdown itself is never renumbered.
 */
export type MoscowChip = MoSCoW | "none";

export const MOSCOW_CHIPS: readonly MoscowChip[] = [...MOSCOW, "none"];
export const TYPE_CHIPS: readonly SolutionType[] = SOLUTION_TYPES;

export interface WbsFilter {
  text: string;
  hiddenTypes: ReadonlySet<SolutionType>;
  hiddenMoscow: ReadonlySet<MoscowChip>;
}

export const NO_FILTER: WbsFilter = { text: "", hiddenTypes: new Set(), hiddenMoscow: new Set() };

export function isFiltering(filter: WbsFilter): boolean {
  return filter.text.trim() !== "" || filter.hiddenTypes.size > 0 || filter.hiddenMoscow.size > 0;
}

/** The same filter with one chip turned the other way. */
export function toggleTypeChip(filter: WbsFilter, type: SolutionType): WbsFilter {
  return { ...filter, hiddenTypes: flipped(filter.hiddenTypes, type) };
}

export function toggleMoscowChip(filter: WbsFilter, chip: MoscowChip): WbsFilter {
  return { ...filter, hiddenMoscow: flipped(filter.hiddenMoscow, chip) };
}

function flipped<T>(set: ReadonlySet<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

export interface WbsShown {
  /** Items that show: the matches and the items above them. */
  items: Set<number>;
  /** Per item, the requirements that show: the matches and their allocated parents. */
  requirements: Map<number, Set<number>>;
}

function matcher(filter: WbsFilter) {
  const needle = filter.text.trim().toLocaleLowerCase();
  const holds = (text: string) => text.toLocaleLowerCase().includes(needle);
  const matches = (r: WbsRequirement) =>
    !filter.hiddenTypes.has(r.type) &&
    !filter.hiddenMoscow.has(r.moscow ?? "none") &&
    (needle === "" || holds(`${r.ref} ${r.text}`));
  return { needle, holds, matches };
}

/** What shows under the filter; null when nothing is filtered (everything shows). */
export function wbsShown(wbs: Wbs, filter: WbsFilter): WbsShown | null {
  if (!isFiltering(filter)) return null;
  const { needle, holds, matches } = matcher(filter);

  const items = new Set<number>();
  const requirements = new Map<number, Set<number>>();
  for (const id of wbs.order) {
    const item = wbs.nodes.get(id)!.item;
    const shown = shownRequirements(item, matches);
    requirements.set(id, shown);
    const self =
      (needle !== "" && holds(item.name)) ||
      shown.size > 0 ||
      (needle === "" && item.requirements.length === 0);
    if (self) keepWithAncestors(wbs, id, items);
  }
  return { items, requirements };
}

/** One item's requirements that show under the filter, with their parents; null when unfiltered. */
export function itemRequirementsShown(item: WbsItem, filter: WbsFilter): Set<number> | null {
  return isFiltering(filter) ? shownRequirements(item, matcher(filter).matches) : null;
}

export interface RequirementCounts {
  types: ReadonlyMap<SolutionType, number>;
  moscow: ReadonlyMap<MoscowChip, number>;
}

/** How many of the requirements carry each type and each MoSCoW code ("none" for no code). */
export function requirementCounts(requirements: readonly WbsRequirement[]): RequirementCounts {
  const types = new Map<SolutionType, number>();
  const moscow = new Map<MoscowChip, number>();
  for (const r of requirements) {
    types.set(r.type, (types.get(r.type) ?? 0) + 1);
    const code = r.moscow ?? "none";
    moscow.set(code, (moscow.get(code) ?? 0) + 1);
  }
  return { types, moscow };
}

function shownRequirements(item: WbsItem, matches: (r: WbsRequirement) => boolean): Set<number> {
  const byId = new Map(item.requirements.map((r) => [r.id, r]));
  const shown = new Set<number>();
  for (const r of item.requirements) {
    if (!matches(r)) continue;
    let at: WbsRequirement | undefined = r;
    while (at && !shown.has(at.id)) {
      shown.add(at.id);
      at = at.parentId === null ? undefined : byId.get(at.parentId);
    }
  }
  return shown;
}

function keepWithAncestors(wbs: Wbs, id: number, items: Set<number>) {
  let at: number | null = id;
  while (at !== null && !items.has(at)) {
    items.add(at);
    at = wbs.nodes.get(at)?.parentId ?? null;
  }
}

/**
 * The breakdown as the chart draws it under a filter: only the shown items, each keeping its code,
 * depth and place, so numbering, commands and saves still follow the whole breakdown.
 */
export function shownWbs(wbs: Wbs, items: ReadonlySet<number>): Wbs {
  const nodes = new Map(
    [...wbs.nodes]
      .filter(([id]) => items.has(id))
      .map(([id, node]) => [id, { ...node, childIds: node.childIds.filter((c) => items.has(c)) }]),
  );
  return {
    nodes,
    rootIds: wbs.rootIds.filter((id) => items.has(id)),
    order: wbs.order.filter((id) => items.has(id)),
  };
}
