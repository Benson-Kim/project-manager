import { describe, expect, it } from "vitest";
import { buildWbs, type WbsItem, type WbsRequirement } from "../schemas/wbs";
import {
  NO_FILTER,
  isFiltering,
  itemRequirementsShown,
  requirementCounts,
  shownWbs,
  toggleMoscowChip,
  toggleTypeChip,
  wbsShown,
  type WbsFilter,
} from "../schemas/wbs-filter";

function requirement(id: number, more: Partial<WbsRequirement> = {}) {
  return {
    id,
    type: "FR",
    ref: `FR-${id}`,
    text: `Requirement ${id}`,
    isMet: false,
    sortOrder: id,
    rowVer: id,
    placeRowVer: id,
    parentId: null,
    moscow: null,
    criteria: null,
    estimateDays: null,
    ownerId: null,
    ownerName: null,
    ...more,
  } satisfies WbsRequirement;
}

function item(id: number, parentId: number | null, more: Partial<WbsItem> = {}) {
  return {
    id,
    parentId,
    sortOrder: id,
    name: `Item ${id}`,
    requestedDate: null,
    start: null,
    end: null,
    status: null,
    priority: null,
    color: null,
    isMilestone: false,
    assigneeNames: null,
    assignees: [],
    requirements: [],
    budget: null,
    note: null,
    rowVer: id,
    ...more,
  } satisfies WbsItem;
}

// 1 Design
//   2 Login screen: FR-10 "Sign in" (M) > FR-11 "Remember me" (C); NFR-12 "Fast" (no code)
//   3 Reports: TR-13 "Export" (S)
// 4 Build (no requirements)
//   5 Pipeline (no requirements)
const wbs = buildWbs([
  item(1, null, { name: "Design" }),
  item(2, 1, {
    name: "Login screen",
    requirements: [
      requirement(10, { text: "Sign in", moscow: "M" }),
      requirement(11, { text: "Remember me", moscow: "C", parentId: 10 }),
      requirement(12, { type: "NFR", ref: "NFR-12", text: "Fast" }),
    ],
  }),
  item(3, 1, {
    name: "Reports",
    requirements: [requirement(13, { type: "TR", ref: "TR-13", text: "Export", moscow: "S" })],
  }),
  item(4, null, { name: "Build" }),
  item(5, 4, { name: "Pipeline" }),
]);

const filter = (more: Partial<WbsFilter>): WbsFilter => ({ ...NO_FILTER, ...more });
const ids = (set: ReadonlySet<number> | undefined) => [...(set ?? [])].sort((a, b) => a - b);

describe("wbsShown", () => {
  it("filters nothing without search text or a chip turned off", () => {
    expect(isFiltering(NO_FILTER)).toBe(false);
    expect(isFiltering(filter({ text: "   " }))).toBe(false);
    expect(wbsShown(wbs, NO_FILTER)).toBeNull();
  });

  it("finds a sub-requirement and keeps its parent requirement and the items above", () => {
    const shown = wbsShown(wbs, filter({ text: "remember" }))!;
    expect(ids(shown.items)).toEqual([1, 2]);
    expect(ids(shown.requirements.get(2))).toEqual([10, 11]);
    expect(ids(shown.requirements.get(3))).toEqual([]);
  });

  it("matches a requirement's reference and ignores case", () => {
    const shown = wbsShown(wbs, filter({ text: "tr-13" }))!;
    expect(ids(shown.items)).toEqual([1, 3]);
    expect(ids(shown.requirements.get(3))).toEqual([13]);
  });

  it("shows an item whose name matches, with only its matching requirements", () => {
    const shown = wbsShown(wbs, filter({ text: "pipe" }))!;
    expect(ids(shown.items)).toEqual([4, 5]);
    const login = wbsShown(wbs, filter({ text: "login" }))!;
    expect(ids(login.items)).toEqual([1, 2]);
    expect(ids(login.requirements.get(2))).toEqual([]);
  });

  it("hides a requirement type; items without requirements still show", () => {
    const shown = wbsShown(wbs, toggleTypeChip(NO_FILTER, "FR"))!;
    expect(ids(shown.requirements.get(2))).toEqual([12]);
    expect(ids(shown.items)).toEqual([1, 2, 3, 4, 5]);
    const noTr = wbsShown(wbs, toggleTypeChip(toggleTypeChip(NO_FILTER, "FR"), "TR"))!;
    expect(ids(noTr.items)).toEqual([1, 2, 4, 5]);
  });

  it("hides a MoSCoW code, and 'none' hides the requirements without one", () => {
    const noNone = wbsShown(wbs, toggleMoscowChip(NO_FILTER, "none"))!;
    expect(ids(noNone.requirements.get(2))).toEqual([10, 11]);
    const mustOnly = ["S", "C", "none"] as const;
    const must = wbsShown(
      wbs,
      mustOnly.reduce((f, chip) => toggleMoscowChip(f, chip), NO_FILTER),
    )!;
    expect(ids(must.requirements.get(2))).toEqual([10]);
    expect(ids(must.items)).toEqual([1, 2, 4, 5]);
  });

  it("turns a chip back on when toggled twice", () => {
    const twice = toggleMoscowChip(toggleMoscowChip(NO_FILTER, "W"), "W");
    expect(isFiltering(twice)).toBe(false);
  });

  it("finds nothing when nothing matches", () => {
    const shown = wbsShown(wbs, filter({ text: "zzz" }))!;
    expect(shown.items.size).toBe(0);
  });
});

describe("shownWbs", () => {
  it("keeps only the shown items, each with its own code and place", () => {
    const view = shownWbs(wbs, new Set([1, 3]));
    expect(view.rootIds).toEqual([1]);
    expect(view.order).toEqual([1, 3]);
    expect(view.nodes.get(1)!.childIds).toEqual([3]);
    expect(view.nodes.get(3)!.code).toBe("1.2");
    expect(view.nodes.get(3)!.index).toBe(1);
    expect(view.nodes.has(2)).toBe(false);
    expect(wbs.nodes.get(1)!.childIds).toEqual([2, 3]);
  });
});

describe("itemRequirementsShown", () => {
  const login = wbs.nodes.get(2)!.item;

  it("is null while nothing is filtered", () => {
    expect(itemRequirementsShown(login, NO_FILTER)).toBeNull();
  });

  it("keeps a shown sub-requirement's parent, and drops a type turned off", () => {
    const off = toggleMoscowChip(toggleMoscowChip(NO_FILTER, "M"), "none");
    expect(ids(itemRequirementsShown(login, off)!)).toEqual([10, 11]);
    expect(ids(itemRequirementsShown(login, toggleTypeChip(NO_FILTER, "FR"))!)).toEqual([12]);
  });
});

describe("requirementCounts", () => {
  it("counts each type and each MoSCoW code, an uncoded one as none", () => {
    const counts = requirementCounts(wbs.nodes.get(2)!.item.requirements);
    expect([...counts.types]).toEqual([
      ["FR", 2],
      ["NFR", 1],
    ]);
    expect([...counts.moscow]).toEqual([
      ["M", 1],
      ["C", 1],
      ["none", 1],
    ]);
  });

  it("is empty for an item without requirements", () => {
    const counts = requirementCounts([]);
    expect(counts.types.size).toBe(0);
    expect(counts.moscow.size).toBe(0);
  });
});
