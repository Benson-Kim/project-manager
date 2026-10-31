import { describe, expect, it } from "vitest";
import {
  buildWbs,
  itemEffort,
  itemProgress,
  planBudget,
  planProgress,
  requirementsProgress,
  rolledBudget,
  rolledEffort,
  statusToCompletion,
  type WbsItem,
  type WbsRequirement,
} from "../schemas/wbs";

/** Progress from met ticks, budget roll-up and effort (ADR-0052). */

function item(id: number, parentId: number | null, more: Partial<WbsItem> = {}): WbsItem {
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
  };
}

function req(id: number, more: Partial<WbsRequirement> = {}): WbsRequirement {
  return {
    id,
    type: "FR",
    ref: `FR-${id}`,
    text: `R${id}`,
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
  };
}

describe("requirementsProgress", () => {
  it("is null for an item with no requirements, so the status decides", () => {
    expect(requirementsProgress([])).toBeNull();
  });

  it("is the share of met requirements when none nests", () => {
    expect(requirementsProgress([req(1, { isMet: true }), req(2), req(3), req(4)])).toBe(25);
    expect(requirementsProgress([req(1, { isMet: true })])).toBe(100);
  });

  it("averages a parent's allocated sub-requirements and ignores the parent's own tick", () => {
    // FR-1 (ticked) has FR-1.1 met and FR-1.2 not: FR-1 counts as 50. FR-2 unmet: 0. Item: 25.
    const list = [
      req(1, { isMet: true }),
      req(11, { parentId: 1, isMet: true }),
      req(12, { parentId: 1 }),
      req(2),
    ];
    expect(requirementsProgress(list)).toBe(25);
  });

  it("treats a sub-requirement whose parent is not allocated here as a top", () => {
    expect(requirementsProgress([req(11, { parentId: 1, isMet: true }), req(2)])).toBe(50);
  });

  it("nests more than one level", () => {
    const list = [
      req(1),
      req(11, { parentId: 1 }),
      req(111, { parentId: 11, isMet: true }),
      req(112, { parentId: 11 }),
      req(12, { parentId: 1, isMet: true }),
    ];
    // FR-1.1 = 50, FR-1.2 = 100, FR-1 = 75.
    expect(requirementsProgress(list)).toBe(75);
  });
});

describe("itemProgress", () => {
  it("uses met ticks where an item has requirements and the status where it has none", () => {
    const wbs = buildWbs([
      item(1, null, { requirements: [req(1, { isMet: true }), req(2)], status: "Completed" }),
      item(2, null, { status: "In Progress" }),
      item(3, null),
    ]);
    const progress = itemProgress(wbs);
    expect(progress.get(1)).toBe(50);
    expect(progress.get(2)).toBe(statusToCompletion("In Progress"));
    expect(progress.get(3)).toBe(0);
  });

  it("makes a parent the average of its sub-items, whatever its own status or requirements", () => {
    const wbs = buildWbs([
      item(1, null, { status: "Completed", requirements: [req(9)] }),
      item(2, 1, { status: "Completed" }),
      item(3, 1, { requirements: [req(1), req(2, { isMet: true })] }),
      item(4, 3),
      item(5, 3, { status: "Completed" }),
    ]);
    const progress = itemProgress(wbs);
    expect(progress.get(3)).toBe(50);
    expect(progress.get(1)).toBe(75);
    expect(planProgress(wbs, progress)).toBe(75);
  });

  it("reads an empty plan as 0", () => {
    const wbs = buildWbs([]);
    expect(planProgress(wbs, itemProgress(wbs))).toBe(0);
  });
});

describe("rolledBudget", () => {
  it("keeps a leaf's own budget and sums a parent's from its sub-items", () => {
    const wbs = buildWbs([
      item(1, null, { budget: 999 }),
      item(2, 1, { budget: 100.1 }),
      item(3, 1, { budget: 200.2 }),
      item(4, null, { budget: 50 }),
    ]);
    const budgets = rolledBudget(wbs);
    // A parent's stored budget is not shown: the procs refuse one, as they do its dates.
    expect(budgets.get(1)).toBe(300.3);
    expect(budgets.get(4)).toBe(50);
    expect(planBudget(wbs, budgets)).toBe(350.3);
  });

  it("is null where nothing in the branch has a budget, never 0", () => {
    const wbs = buildWbs([item(1, null), item(2, 1), item(3, null, { budget: 0 })]);
    const budgets = rolledBudget(wbs);
    expect(budgets.get(1)).toBeNull();
    expect(budgets.get(3)).toBe(0);
    expect(planBudget(buildWbs([item(1, null)]), rolledBudget(buildWbs([item(1, null)])))).toBe(
      null,
    );
  });
});

describe("itemEffort", () => {
  it("sums the estimates that are set, to one decimal, and is null when none is", () => {
    expect(itemEffort([req(1, { estimateDays: 1.2 }), req(2, { estimateDays: 2.1 }), req(3)])).toBe(
      3.3,
    );
    expect(itemEffort([req(1)])).toBeNull();
    expect(itemEffort([])).toBeNull();
  });
});

describe("rolledEffort", () => {
  it("adds a parent's own estimates to its sub-items' rolled effort", () => {
    const wbs = buildWbs([
      item(1, null, { requirements: [req(1, { estimateDays: 0.5 })] }),
      item(2, 1, { requirements: [req(2, { estimateDays: 1.2 })] }),
      item(3, 1),
      item(4, 3, { requirements: [req(3, { estimateDays: 2.1 }), req(4)] }),
    ]);
    const effort = rolledEffort(wbs);
    expect(effort.get(4)).toBe(2.1);
    expect(effort.get(3)).toBe(2.1);
    expect(effort.get(2)).toBe(1.2);
    expect(effort.get(1)).toBe(3.8);
  });

  it("is null where nothing in the branch has an estimate, never 0", () => {
    const wbs = buildWbs([
      item(1, null, { requirements: [req(1)] }),
      item(2, 1),
      item(3, null, { requirements: [req(2, { estimateDays: 0 })] }),
    ]);
    const effort = rolledEffort(wbs);
    expect(effort.get(1)).toBeNull();
    expect(effort.get(2)).toBeNull();
    expect(effort.get(3)).toBe(0);
  });
});
