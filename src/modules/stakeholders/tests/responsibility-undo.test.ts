import { describe, expect, it } from "vitest";
import { responsibilityFramework } from "../schemas/responsibility-frameworks";
import { ResponsibilityGrid } from "../schemas/responsibility-grid";
import type { ResponsibilityCell, ResponsibilityRowRef } from "../schemas/responsibility-matrix";
import {
  canUndo,
  dropUndo,
  pushUndo,
  putBackRefused,
  setBack,
  stepBack,
  takeUndo,
  writesOf,
  type MatrixNow,
} from "../schemas/responsibility-undo";

const raci = responsibilityFramework("RACI");
const row: ResponsibilityRowRef = { kind: "WbsItem", keyDeliverableId: 3 };
const other: ResponsibilityRowRef = { kind: "Decision", decisionId: 4 };
const cell = (
  stakeholderId: number,
  roleCode: string,
  r: ResponsibilityRowRef = row,
): ResponsibilityCell => ({
  row: r,
  stakeholderId,
  roleCode,
  isMember: true,
});
const now = (
  cells: ResponsibilityCell[],
  rows = [row, other],
  memberIds = [7, 8, 9],
): MatrixNow => ({
  grid: new ResponsibilityGrid(raci, cells),
  rows,
  memberIds,
});

describe("responsibility undo", () => {
  it("puts a set cell back, and redoes it", () => {
    const before = now([cell(7, "CONSULTED")]);
    const back = setBack(before.grid, row, 7, "INFORMED", [], 1)!;
    expect(writesOf(back)).toEqual([
      { row, stakeholderId: 7, roleCode: "CONSULTED", expectedRoleCode: "INFORMED" },
    ]);
    expect(writesOf(stepBack(back, 2))).toEqual([
      { row, stakeholderId: 7, roleCode: "INFORMED", expectedRoleCode: "CONSULTED" },
    ]);
    expect(setBack(before.grid, row, 7, "CONSULTED", [], 3)).toBeNull();
  });

  it("undoes a move by freeing the role first, then giving it back to its holder", () => {
    const before = now([cell(7, "ACCOUNTABLE"), cell(8, "CONSULTED")]);
    const back = setBack(before.grid, row, 8, "ACCOUNTABLE", [7, 8], 1)!;
    expect(writesOf(back)).toEqual([
      { row, stakeholderId: 8, roleCode: "CONSULTED", expectedRoleCode: "ACCOUNTABLE" },
      { row, stakeholderId: 7, roleCode: "ACCOUNTABLE", expectedRoleCode: null },
    ]);
    expect(writesOf(stepBack(back, 2))).toEqual([
      { row, stakeholderId: 7, roleCode: null, expectedRoleCode: "ACCOUNTABLE" },
      { row, stakeholderId: 8, roleCode: "ACCOUNTABLE", expectedRoleCode: "CONSULTED" },
    ]);
    const after = now([cell(8, "ACCOUNTABLE")]);
    expect(takeUndo([back], after)).toEqual({ step: back, rest: [], dropped: 0 });
  });

  it("drops the undo of a move when either cell changed since, and says how many went", () => {
    const back = setBack(now([cell(7, "ACCOUNTABLE")]).grid, row, 8, "ACCOUNTABLE", [7], 1)!;
    const older = setBack(now([]).grid, other, 9, "INFORMED", [], 2)!;
    const stack = pushUndo(pushUndo([], older), back);
    const holderChanged = now([
      cell(8, "ACCOUNTABLE"),
      cell(7, "INFORMED"),
      cell(9, "INFORMED", other),
    ]);
    expect(takeUndo(stack, holderChanged)).toEqual({ step: older, rest: [], dropped: 1 });
    const targetChanged = now([cell(8, "CONSULTED"), cell(9, "INFORMED", other)]);
    expect(takeUndo(stack, targetChanged).dropped).toBe(1);
  });

  it("drops a step whose row or member is gone", () => {
    const back = setBack(now([]).grid, row, 7, "INFORMED", [], 1)!;
    expect(canUndo([back], now([cell(7, "INFORMED")]))).toBe(true);
    expect(canUndo([back], now([], [other]))).toBe(false);
    expect(takeUndo([back], now([cell(7, "INFORMED")], [row], [8, 9]))).toEqual({
      step: null,
      rest: [],
      dropped: 1,
    });
  });

  it("forgets the step of a change the server refused", () => {
    const a = setBack(now([]).grid, row, 7, "INFORMED", [], 1)!;
    const b = setBack(now([]).grid, row, 8, "INFORMED", [], 2)!;
    expect(dropUndo(pushUndo(pushUndo([], a), b), 2)).toEqual([a]);
  });
});

describe("a refused replay", () => {
  const step = { key: 1, changes: [{ row, stakeholderId: 7, from: "R", to: "A" }] };
  const back = stepBack(step, 2);

  it("puts an undo back on the undo stack and takes its redo away", () => {
    const h = putBackRefused({ matrixId: 5, undo: [], redo: [back] }, "undo", step, back.key);
    expect(h).toEqual({ matrixId: 5, undo: [step], redo: [] });
  });

  it("puts a redo back on the redo stack and takes its undo away", () => {
    const h = putBackRefused({ undo: [back], redo: [] }, "redo", step, back.key);
    expect(h).toEqual({ undo: [], redo: [step] });
  });
});
