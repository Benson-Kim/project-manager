import { describe, expect, it } from "vitest";
import {
  MAX_WBS_DEPTH,
  addDays,
  applyMilestone,
  applyMove,
  applyReschedule,
  buildWbs,
  type WbsItem,
} from "../schemas/wbs";
import {
  UNDO_LIMIT,
  canUndo,
  dropUndo,
  moveBack,
  pushUndo,
  rescheduleBack,
  takeUndo,
  type UndoStep,
} from "../schemas/wbs-undo";

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
    isMilestone: false,
    assigneeNames: null,
    assignees: [],
    requirements: [],
    budget: null,
    note: null,
    rowVer: id * 100,
    ...more,
  } satisfies WbsItem;
}

/** 1 Design (1.1 Plans, 1.2 Permits), 2 Build (2.1 Foundations (2.1.1 Dig, 2.1.2 Pour), 2.2 Walls) */
function building(): WbsItem[] {
  return [
    item(10, null, 1, { name: "Design" }),
    item(11, 10, 1, { name: "Plans", start: d("2024-04-01"), end: d("2024-04-05") }),
    item(12, 10, 2, { name: "Permits", start: d("2024-04-08"), end: d("2024-04-19") }),
    item(20, null, 2, { name: "Build" }),
    item(21, 20, 1, { name: "Foundations" }),
    item(211, 21, 1, { name: "Dig", start: d("2024-04-22"), end: d("2024-04-24") }),
    item(212, 21, 2, { name: "Pour", start: d("2024-04-25"), end: d("2024-04-30") }),
    item(22, 20, 2, { name: "Walls", start: d("2024-05-01"), end: d("2024-05-31") }),
  ];
}

const places = (rows: WbsItem[]) =>
  rows.map(({ id, parentId, sortOrder }) => ({ id, parentId, sortOrder }));
const dates = (rows: WbsItem[]) => rows.map(({ id, start, end }) => ({ id, start, end }));

function step(key: number, id: number): UndoStep {
  return { key, kind: "reschedule", id, start: d("2024-01-01"), end: d("2024-01-02") };
}

describe("moveBack", () => {
  it("takes an item back to its old parent and place", () => {
    const rows = building();
    const back = moveBack(buildWbs(rows), 12, { parentId: 20, position: 1 }, 1);
    expect(back).toEqual({
      key: 1,
      kind: "move",
      id: 12,
      placement: { parentId: 10, position: 2 },
    });
    const moved = applyMove(rows, 12, { parentId: 20, position: 1 });
    if (back?.kind !== "move") throw new Error("a move step");
    expect(places(applyMove(moved, 12, back.placement))).toEqual(places(rows));
  });

  it("takes back a reorder among the same siblings", () => {
    const rows = building();
    const back = moveBack(buildWbs(rows), 11, { parentId: 10, position: 2 }, 1);
    if (back?.kind !== "move") throw new Error("a move step");
    expect(back.placement).toEqual({ parentId: 10, position: 1 });
    const moved = applyMove(rows, 11, { parentId: 10, position: 2 });
    expect(places(applyMove(moved, 11, back.placement))).toEqual(places(rows));
  });

  it("records nothing for a move that leaves the item where it is", () => {
    const wbs = buildWbs(building());
    expect(moveBack(wbs, 12, { parentId: 10, position: 2 }, 1)).toBeNull();
    // Past the end is the last place, and before the start is the first.
    expect(moveBack(wbs, 12, { parentId: 10, position: 99 }, 1)).toBeNull();
    expect(moveBack(wbs, 11, { parentId: 10, position: 0 }, 1)).toBeNull();
    expect(moveBack(wbs, 999, { parentId: null, position: 1 }, 1)).toBeNull();
  });
});

describe("rescheduleBack", () => {
  it("keeps a leaf's own dates", () => {
    expect(rescheduleBack(buildWbs(building()), 11, 3)).toEqual({
      key: 3,
      kind: "reschedule",
      id: 11,
      start: d("2024-04-01"),
      end: d("2024-04-05"),
    });
  });

  it("takes a parent's whole branch back by its rolled-up dates", () => {
    const rows = building();
    const wbs = buildWbs(rows);
    const back = rescheduleBack(wbs, 21, 1);
    if (back?.kind !== "reschedule") throw new Error("a reschedule step");
    expect([back.start, back.end]).toEqual([d("2024-04-22"), d("2024-04-30")]);
    const later = applyReschedule(rows, wbs, 21, addDays(back.start, 7), addDays(back.end, 7));
    expect(dates(applyReschedule(later, buildWbs(later), 21, back.start, back.end))).toEqual(
      dates(rows),
    );
  });

  it("records nothing for an item without dates", () => {
    const wbs = buildWbs([...building(), item(30, null, 3)]);
    expect(rescheduleBack(wbs, 30, 1)).toBeNull();
    expect(rescheduleBack(wbs, 999, 1)).toBeNull();
  });
});

describe("the undo stack", () => {
  it(`keeps the newest ${UNDO_LIMIT} steps and ignores no step`, () => {
    let stack: UndoStep[] = [];
    for (let key = 1; key <= UNDO_LIMIT + 5; key++) stack = pushUndo(stack, step(key, 11));
    expect(stack).toHaveLength(UNDO_LIMIT);
    expect(stack[0].key).toBe(6);
    expect(stack.at(-1)?.key).toBe(UNDO_LIMIT + 5);
    expect(pushUndo(stack, null)).toEqual(stack);
  });

  it("forgets a refused step by its key", () => {
    expect(dropUndo([step(1, 11), step(2, 12)], 1)).toEqual([step(2, 12)]);
  });

  it("takes the newest step and leaves the ones under it", () => {
    const wbs = buildWbs(building());
    const { step: taken, rest } = takeUndo([step(1, 11), step(2, 12)], wbs);
    expect(taken).toEqual(step(2, 12));
    expect(rest).toEqual([step(1, 11)]);
    expect(takeUndo([], wbs)).toEqual({ step: null, rest: [] });
    expect(canUndo([], wbs)).toBe(false);
  });

  it("drops a step whose item is gone", () => {
    const wbs = buildWbs(building().filter((i) => i.id !== 12));
    const stack = [step(1, 11), step(2, 12)];
    expect(canUndo([step(2, 12)], wbs)).toBe(false);
    expect(takeUndo(stack, wbs)).toEqual({ step: step(1, 11), rest: [] });
  });

  it("drops a move whose old parent can no longer take the item back", () => {
    const back = (id: number, parentId: number | null): UndoStep => ({
      key: 1,
      kind: "move",
      id,
      placement: { parentId, position: 1 },
    });
    // Its old parent was deleted.
    expect(canUndo([back(12, 10)], buildWbs(building().filter((i) => i.id !== 10)))).toBe(false);
    // Its old parent is now inside its own branch: Design moved under Build, Build under Design.
    const looped = applyMove(building(), 10, { parentId: 20, position: 1 });
    expect(canUndo([back(20, 10)], buildWbs(looped))).toBe(false);
    // Its old parent became a milestone.
    const gate = applyMilestone(
      building().filter((i) => i.parentId !== 10),
      10,
      true,
    );
    expect(canUndo([back(11, 10)], buildWbs([...gate, item(11, null, 3)]))).toBe(false);
    // Under its old parent the branch would now be too deep.
    const deep = Array.from({ length: MAX_WBS_DEPTH }, (_, i) =>
      item(i + 1, i === 0 ? null : i, 1),
    );
    const branch = [item(50, null, 2), item(51, 50, 1)];
    expect(canUndo([back(50, MAX_WBS_DEPTH)], buildWbs([...deep, ...branch]))).toBe(false);
    // A top-level place always takes it back.
    expect(canUndo([back(12, null)], buildWbs(building()))).toBe(true);
  });
});
