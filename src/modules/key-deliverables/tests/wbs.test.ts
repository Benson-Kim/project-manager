import { describe, expect, it } from "vitest";
import {
  MAX_WBS_DEPTH,
  addDays,
  applyMove,
  applyReschedule,
  buildWbs,
  dayDiff,
  descendantIds,
  dropPlacement,
  durationDays,
  fitsUnder,
  indentTarget,
  moveDownTarget,
  moveUpTarget,
  newItemDates,
  outdentTarget,
  requestedDateClash,
  todayUtc,
  visibleIds,
  wbsBounds,
  NO_STATUS_COLOR,
  applyRequirementEdit,
  applyRequirementMove,
  applyRequirementRemove,
  applyStatus,
  findRequirement,
  requirementIn,
  statusColor,
  type WbsItem,
} from "../schemas/wbs";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

function item(id: number, parentId: number | null, sortOrder: number, more: Partial<WbsItem> = {}) {
  return {
    id,
    parentId,
    sortOrder,
    name: `Item ${id}`,
    requestedDate: null,
    start: null,
    end: null,
    status: null,
    priority: null,
    color: null,
    assigneeNames: null,
    assignees: [],
    requirements: [],
    rowVer: id * 100,
    ...more,
  } satisfies WbsItem;
}

/**
 * The "New Building" breakdown from the checklist (row 67):
 * 1 Design (1.1 Plans, 1.2 Permits), 2 Build (2.1 Foundations (2.1.1 Dig, 2.1.2 Pour), 2.2 Walls)
 */
function building(): WbsItem[] {
  return [
    item(10, null, 1, { name: "Design", color: "purple" }),
    item(11, 10, 1, { name: "Plans", start: d("2024-04-01"), end: d("2024-04-05") }),
    item(12, 10, 2, { name: "Permits", start: d("2024-04-08"), end: d("2024-04-19") }),
    item(20, null, 2, { name: "Build" }),
    item(21, 20, 1, { name: "Foundations", color: "orange" }),
    item(211, 21, 1, { name: "Dig", start: d("2024-04-22"), end: d("2024-04-24") }),
    item(212, 21, 2, { name: "Pour", start: d("2024-04-25"), end: d("2024-04-30") }),
    item(22, 20, 2, { name: "Walls", start: d("2024-05-01"), end: d("2024-05-31") }),
  ];
}

/** A chain of `levels` items, each under the one before: 1, 1.1, 1.1.1 … */
function chain(levels: number): WbsItem[] {
  return Array.from({ length: levels }, (_, i) =>
    item(
      i + 1,
      i === 0 ? null : i,
      1,
      i === levels - 1 ? { start: d("2024-01-01"), end: d("2024-01-02") } : {},
    ),
  );
}

describe("buildWbs", () => {
  it("numbers items by their place among siblings, at every level", () => {
    const wbs = buildWbs(building());
    const codes = wbs.order.map((id) => [wbs.nodes.get(id)!.code, wbs.nodes.get(id)!.item.name]);
    expect(codes).toEqual([
      ["1", "Design"],
      ["1.1", "Plans"],
      ["1.2", "Permits"],
      ["2", "Build"],
      ["2.1", "Foundations"],
      ["2.1.1", "Dig"],
      ["2.1.2", "Pour"],
      ["2.2", "Walls"],
    ]);
  });

  it("goes at least five levels deep (1.1.1.1.1) and numbers by sort order, not id", () => {
    const wbs = buildWbs([...chain(5), item(99, 4, 0, { name: "First" })]);
    expect(wbs.nodes.get(5)!.code).toBe("1.1.1.1.2");
    expect(wbs.nodes.get(99)!.code).toBe("1.1.1.1.1");
    expect(wbs.nodes.get(5)!.depth).toBe(5);
    expect(wbs.nodes.get(1)!.height).toBe(5);
  });

  it("rolls a parent's dates up from the items at the bottom of its branch", () => {
    const wbs = buildWbs(building());
    expect(wbs.nodes.get(21)).toMatchObject({ start: d("2024-04-22"), end: d("2024-04-30") });
    expect(wbs.nodes.get(20)).toMatchObject({ start: d("2024-04-22"), end: d("2024-05-31") });
    expect(wbs.nodes.get(10)).toMatchObject({ start: d("2024-04-01"), end: d("2024-04-19") });
  });

  it("draws an item in its status's colour, else grey, whatever colour was stored", () => {
    const colors = new Map([
      ["In Progress", "blue"],
      ["Completed", "green"],
    ] as const);
    const rows = building().map((i) =>
      i.id === 12
        ? { ...i, status: "Completed" }
        : i.id === 21
          ? { ...i, status: "In Progress" }
          : i.id === 22
            ? { ...i, status: "Pending" }
            : i,
    );
    const wbs = buildWbs(rows, colors);
    expect(wbs.nodes.get(12)!.color).toBe("green");
    expect(wbs.nodes.get(21)!.color).toBe("blue");
    // Not inherited from a parent, and a stored bar colour no longer counts.
    expect(wbs.nodes.get(212)!.color).toBe(NO_STATUS_COLOR);
    expect(wbs.nodes.get(10)!.color).toBe(NO_STATUS_COLOR);
    // A status without a colour in the list.
    expect(wbs.nodes.get(22)!.color).toBe(NO_STATUS_COLOR);
    expect(buildWbs(rows).nodes.get(12)!.color).toBe(NO_STATUS_COLOR);
  });

  it("puts an item whose parent is gone at the top level rather than losing it", () => {
    const wbs = buildWbs([item(1, null, 1), item(2, 404, 1)]);
    expect(wbs.rootIds).toEqual([1, 2]);
    expect(wbs.nodes.get(2)!.code).toBe("2");
  });
});

describe("visibleIds and descendantIds", () => {
  it("hides the branch under a collapsed item, at any depth", () => {
    const wbs = buildWbs(building());
    expect(visibleIds(wbs, new Set([21]))).toEqual([10, 11, 12, 20, 21, 22]);
    expect(visibleIds(wbs, new Set([20, 211]))).toEqual([10, 11, 12, 20]);
    expect(visibleIds(wbs, new Set([11]))).toEqual(wbs.order);
  });

  it("lists every item below an item", () => {
    expect(descendantIds(buildWbs(building()), 20)).toEqual([21, 211, 212, 22]);
    expect(descendantIds(buildWbs(building()), 22)).toEqual([]);
  });
});

describe("indent, outdent and move targets", () => {
  const wbs = buildWbs(building());

  it("indents under the item above at the same level, as its last sub-item", () => {
    expect(indentTarget(wbs, 22)).toEqual({ parentId: 21, position: 3 });
    expect(indentTarget(wbs, 20)).toEqual({ parentId: 10, position: 3 });
    expect(indentTarget(wbs, 10)).toBeNull();
    expect(indentTarget(wbs, 211)).toBeNull();
  });

  it("outdents to just after its parent", () => {
    expect(outdentTarget(wbs, 211)).toEqual({ parentId: 20, position: 2 });
    expect(outdentTarget(wbs, 11)).toEqual({ parentId: null, position: 2 });
    expect(outdentTarget(wbs, 10)).toBeNull();
  });

  it("moves up and down among siblings only", () => {
    expect(moveUpTarget(wbs, 12)).toEqual({ parentId: 10, position: 1 });
    expect(moveUpTarget(wbs, 11)).toBeNull();
    expect(moveDownTarget(wbs, 11)).toEqual({ parentId: 10, position: 2 });
    expect(moveDownTarget(wbs, 22)).toBeNull();
  });

  it("will not indent past the deepest level, counting the item's own sub-items", () => {
    const deep = buildWbs([...chain(MAX_WBS_DEPTH), item(100, MAX_WBS_DEPTH - 1, 2)]);
    expect(deep.nodes.get(100)!.depth).toBe(MAX_WBS_DEPTH);
    expect(indentTarget(deep, 100)).toBeNull();

    const branch = buildWbs([
      ...chain(MAX_WBS_DEPTH - 1),
      item(200, MAX_WBS_DEPTH - 2, 2),
      item(201, 200, 1),
    ]);
    expect(branch.nodes.get(200)).toMatchObject({ depth: MAX_WBS_DEPTH - 1, height: 2 });
    expect(indentTarget(branch, 200)).toBeNull();
    expect(indentTarget(branch, 201)).toBeNull();
  });
});

describe("dropPlacement (dragging a box in the WBS diagram)", () => {
  const wbs = buildWbs(building());

  it("drops into a box as its last sub-item, or in front of or behind it", () => {
    expect(dropPlacement(wbs, 22, 10, "into")).toEqual({ parentId: 10, position: 3 });
    expect(dropPlacement(wbs, 22, 11, "before")).toEqual({ parentId: 10, position: 1 });
    expect(dropPlacement(wbs, 22, 12, "after")).toEqual({ parentId: 10, position: 3 });
    expect(dropPlacement(wbs, 211, 22, "before")).toEqual({ parentId: 20, position: 2 });
  });

  it("reorders among its own siblings, counted without the dragged item", () => {
    expect(dropPlacement(wbs, 11, 12, "after")).toEqual({ parentId: 10, position: 2 });
    expect(dropPlacement(wbs, 12, 11, "before")).toEqual({ parentId: 10, position: 1 });
    expect(dropPlacement(wbs, 20, 10, "before")).toEqual({ parentId: null, position: 1 });
  });

  it("takes items on the project box as the last top-level item", () => {
    expect(dropPlacement(wbs, 11, null, "into")).toEqual({ parentId: null, position: 3 });
    expect(dropPlacement(wbs, 211, 20, "after")).toEqual({ parentId: null, position: 3 });
  });

  it("refuses a drop that changes nothing", () => {
    expect(dropPlacement(wbs, 11, 12, "before")).toBeNull();
    expect(dropPlacement(wbs, 12, 11, "after")).toBeNull();
    expect(dropPlacement(wbs, 22, 20, "into")).toBeNull();
    expect(dropPlacement(wbs, 20, null, "into")).toBeNull();
    expect(dropPlacement(wbs, 999, 10, "into")).toBeNull();
  });

  it("refuses a drop on the item itself or anywhere in its own branch", () => {
    expect(dropPlacement(wbs, 20, 20, "into")).toBeNull();
    expect(dropPlacement(wbs, 20, 21, "into")).toBeNull();
    expect(dropPlacement(wbs, 20, 211, "before")).toBeNull();
    expect(dropPlacement(wbs, 21, 212, "after")).toBeNull();
  });

  it("refuses a drop that takes the branch past the deepest level", () => {
    const deep = buildWbs([...chain(MAX_WBS_DEPTH), item(300, null, 2), item(301, 300, 1)]);
    expect(fitsUnder(deep, 300, MAX_WBS_DEPTH - 1)).toBe(false);
    expect(dropPlacement(deep, 300, MAX_WBS_DEPTH - 1, "into")).toBeNull();
    expect(dropPlacement(deep, 300, MAX_WBS_DEPTH - 2, "into")).toEqual({
      parentId: MAX_WBS_DEPTH - 2,
      position: 2,
    });
    expect(dropPlacement(deep, 301, MAX_WBS_DEPTH - 1, "into")).toEqual({
      parentId: MAX_WBS_DEPTH - 1,
      position: 2,
    });
  });
});

describe("applyMove (what usp_KeyDeliverable_Move does)", () => {
  function codesAfter(rows: WbsItem[]) {
    const wbs = buildWbs(rows);
    return Object.fromEntries(
      wbs.order.map((id) => [wbs.nodes.get(id)!.item.name, wbs.nodes.get(id)!.code]),
    );
  }

  it("indents: Walls becomes 2.1.3 and its old siblings close up", () => {
    const rows = applyMove(building(), 22, { parentId: 21, position: 3 });
    expect(codesAfter(rows)).toMatchObject({ Foundations: "2.1", Walls: "2.1.3" });
    expect(rows.find((r) => r.id === 22)).toMatchObject({ parentId: 21, sortOrder: 3 });
  });

  it("outdents: Dig becomes 2.2, Pour closes up to 2.1.1, Walls moves to 2.3", () => {
    const rows = applyMove(building(), 211, { parentId: 20, position: 2 });
    expect(codesAfter(rows)).toMatchObject({
      Foundations: "2.1",
      Pour: "2.1.1",
      Dig: "2.2",
      Walls: "2.3",
    });
    expect(rows.filter((r) => r.parentId === 20).map((r) => [r.id, r.sortOrder])).toEqual([
      [21, 1],
      [211, 2],
      [22, 3],
    ]);
    expect(rows.find((r) => r.id === 212)!.sortOrder).toBe(1);
  });

  it("moves down within its siblings and clamps a position past the end", () => {
    expect(codesAfter(applyMove(building(), 11, { parentId: 10, position: 2 }))).toMatchObject({
      Permits: "1.1",
      Plans: "1.2",
    });
    expect(
      applyMove(building(), 10, { parentId: null, position: 50 }).find((r) => r.id === 10)!
        .sortOrder,
    ).toBe(2);
  });

  it("keeps the other rows as they were and does not change the input", () => {
    const before = building();
    const rows = applyMove(before, 22, { parentId: 21, position: 3 });
    expect(before.find((r) => r.id === 22)!.parentId).toBe(20);
    expect(rows.find((r) => r.id === 11)).toBe(before.find((r) => r.id === 11));
  });
});

describe("applyReschedule (what usp_KeyDeliverable_Reschedule does)", () => {
  it("gives an item without sub-items the new dates", () => {
    const rows = building();
    const out = applyReschedule(rows, buildWbs(rows), 22, d("2024-05-02"), d("2024-06-10"));
    expect(out.find((r) => r.id === 22)).toMatchObject({
      start: d("2024-05-02"),
      end: d("2024-06-10"),
    });
    expect(buildWbs(out).nodes.get(20)!.end).toEqual(d("2024-06-10"));
  });

  it("moves a parent's whole branch by the same number of days", () => {
    const rows = building();
    const out = applyReschedule(rows, buildWbs(rows), 21, d("2024-04-29"), d("2024-05-07"));
    expect(out.find((r) => r.id === 211)).toMatchObject({
      start: d("2024-04-29"),
      end: d("2024-05-01"),
    });
    expect(out.find((r) => r.id === 212)).toMatchObject({
      start: d("2024-05-02"),
      end: d("2024-05-07"),
    });
    expect(out.find((r) => r.id === 22)).toEqual(rows.find((r) => r.id === 22));
  });
});

describe("requestedDateClash (what usp_KeyDeliverable_Reschedule refuses)", () => {
  const clash = (rows: WbsItem[], id: number, start: string, end: string) =>
    requestedDateClash(rows, buildWbs(rows), id, d(start), d(end));
  const withRequested = (requested: Record<number, string>) =>
    building().map((r) => (requested[r.id] ? { ...r, requestedDate: d(requested[r.id]!) } : r));

  it("lets an item end on its requested date, not before it", () => {
    const rows = withRequested({ 22: "2024-05-20" });
    expect(clash(rows, 22, "2024-05-01", "2024-05-20")).toBeNull();
    expect(clash(rows, 22, "2024-05-01", "2024-05-19")).toBe("item");
  });

  it("refuses moving a branch when a sub-item would end before its requested date", () => {
    const rows = withRequested({ 211: "2024-04-23" });
    expect(clash(rows, 21, "2024-04-20", "2024-04-28")).toBe("subItem");
    expect(clash(rows, 21, "2024-04-22", "2024-04-30")).toBeNull();
  });

  it("refuses a change that would end a parent before its requested date", () => {
    const rows = withRequested({ 20: "2024-05-25" });
    expect(clash(rows, 22, "2024-05-01", "2024-05-24")).toBe("parent");
    expect(clash(rows, 22, "2024-05-01", "2024-05-25")).toBeNull();
  });

  it("checks every parent up the branch, not only the nearest", () => {
    const rows = withRequested({ 20: "2024-04-29" });
    const deep = rows.map((r) => (r.id === 22 ? { ...r, end: d("2024-04-28") } : r));
    expect(clash(deep, 212, "2024-04-25", "2024-04-29")).toBeNull();
    expect(clash(deep, 212, "2024-04-25", "2024-04-28")).toBe("parent");
  });

  it("lets a parent that already ends before its requested date be", () => {
    const rows = withRequested({ 20: "2024-06-15" });
    expect(clash(rows, 22, "2024-05-01", "2024-05-24")).toBeNull();
  });

  it("ignores items without a requested date or an end", () => {
    expect(clash(building(), 22, "2024-05-01", "2024-05-02")).toBeNull();
    expect(clash(building(), 999, "2024-05-01", "2024-05-02")).toBeNull();
  });
});

describe("newItemDates", () => {
  const today = d("2026-10-13");

  it("starts a new item the day after the one before it ends, for a week", () => {
    const wbs = buildWbs(building());
    expect(newItemDates(wbs, { parentId: 10, afterId: 11 }, today, null)).toEqual({
      start: d("2024-04-06"),
      end: d("2024-04-12"),
    });
    expect(newItemDates(wbs, { parentId: null, afterId: null }, today, null)).toEqual({
      start: d("2024-06-01"),
      end: d("2024-06-07"),
    });
  });

  it("gives an item's first sub-item the item's own dates, so the parent's span stays", () => {
    const wbs = buildWbs(building());
    expect(newItemDates(wbs, { parentId: 22, afterId: null }, today, null)).toEqual({
      start: d("2024-05-01"),
      end: d("2024-05-31"),
    });
  });

  it("starts the first item of an empty breakdown on the project start, else today", () => {
    const empty = buildWbs([]);
    expect(
      newItemDates(empty, { parentId: null, afterId: null }, today, d("2026-11-02")).start,
    ).toEqual(d("2026-11-02"));
    expect(newItemDates(empty, { parentId: null, afterId: null }, today, null)).toEqual({
      start: today,
      end: d("2026-10-19"),
    });
  });
});

describe("dates", () => {
  it("counts whole days, both ends included for a bar", () => {
    expect(dayDiff(d("2024-04-16"), d("2024-04-19"))).toBe(3);
    expect(durationDays(d("2024-04-16"), d("2024-04-19"))).toBe(4);
    expect(addDays(d("2024-02-28"), 2)).toEqual(d("2024-03-01"));
  });

  it("takes today from the viewer's calendar as a UTC-midnight date", () => {
    expect(todayUtc(new Date(2026, 9, 13, 23, 59))).toEqual(d("2026-10-13"));
  });

  it("spans the chart over every item's dates", () => {
    expect(wbsBounds(buildWbs(building()))).toEqual({ min: d("2024-04-01"), max: d("2024-05-31") });
    expect(wbsBounds(buildWbs([item(1, null, 1)]))).toEqual({ min: null, max: null });
  });
});

describe("requirements and status on screen (ADR-0037)", () => {
  const req = (id: number, sortOrder: number, text = `R${id}`) => ({
    id,
    type: "FR" as const,
    number: id,
    text,
    isMet: false,
    sortOrder,
    rowVer: id * 10,
    placeRowVer: id * 100,
  });
  const rows = () => [
    item(1, null, 1, { requirements: [req(11, 1), req(12, 2), req(13, 3)] }),
    item(2, null, 2),
  ];
  // The same requirement (11) sits on two deliverables, with its own order under each.
  const shared = () => [
    item(1, null, 1, { requirements: [req(11, 1), req(12, 2)] }),
    item(2, null, 2, { requirements: [req(11, 1), req(21, 2)] }),
  ];

  it("finds a requirement anywhere, and the one on a given deliverable", () => {
    expect(findRequirement(rows(), 12)?.id).toBe(12);
    expect(findRequirement(rows(), 99)).toBeUndefined();
    expect(requirementIn(shared(), 2, 11)?.id).toBe(11);
    expect(requirementIn(shared(), 2, 12)).toBeUndefined();
  });

  it("rewords or ticks a requirement on every deliverable that lists it", () => {
    const next = applyRequirementEdit(shared(), 11, { isMet: true, text: "Permit" });
    expect(next[0]!.requirements[0]).toMatchObject({ id: 11, isMet: true, text: "Permit" });
    expect(next[1]!.requirements[0]).toMatchObject({ id: 11, isMet: true, text: "Permit" });
    // Untouched requirements and items are left alone.
    expect(next[0]!.requirements[1]).toEqual(req(12, 2));
    expect(next[1]!.requirements[1]).toEqual(req(21, 2));
  });

  it("moves a requirement within one deliverable's list, renumbering and clamping", () => {
    const ids = (items: WbsItem[]) => items[0]!.requirements.map((r) => [r.id, r.sortOrder]);
    expect(ids(applyRequirementMove(rows(), 1, 13, 1))).toEqual([
      [13, 1],
      [11, 2],
      [12, 3],
    ]);
    expect(ids(applyRequirementMove(rows(), 1, 11, 99))).toEqual([
      [12, 1],
      [13, 2],
      [11, 3],
    ]);
  });

  it("removes a requirement from one deliverable only, closing the gap and leaving the others", () => {
    const next = applyRequirementRemove(shared(), 1, 11);
    expect(next[0]!.requirements.map((r) => [r.id, r.sortOrder])).toEqual([[12, 1]]);
    // It stays on the other deliverable.
    expect(next[1]!.requirements.map((r) => r.id)).toEqual([11, 21]);
    expect(applyRequirementRemove(rows(), 1, 99)).toEqual(rows());
  });

  it("sets one item's status", () => {
    const next = applyStatus(rows(), 2, "Completed");
    expect(next.map((i) => i.status)).toEqual([null, "Completed"]);
  });

  it("reads a status's colour, falling back to grey", () => {
    const colors = new Map([["Completed", "green"]] as const);
    expect(statusColor("Completed", colors)).toBe("green");
    expect(statusColor("Pending", colors)).toBe(NO_STATUS_COLOR);
    expect(statusColor(null, colors)).toBe(NO_STATUS_COLOR);
  });
});
