import { describe, expect, it } from "vitest";
import { responsibilityFramework } from "../schemas/responsibility-frameworks";
import { ResponsibilityGrid, rowKey } from "../schemas/responsibility-grid";
import type { ResponsibilityCell, ResponsibilityRowRef } from "../schemas/responsibility-matrix";

const raci = responsibilityFramework("RACI");
const wbs: ResponsibilityRowRef = { kind: "WbsItem", keyDeliverableId: 3 };
const decision: ResponsibilityRowRef = { kind: "Decision", decisionId: 3 };

const cell = (
  row: ResponsibilityRowRef,
  stakeholderId: number,
  roleCode: string,
  isMember = true,
): ResponsibilityCell => ({ row, stakeholderId, roleCode, isMember });

describe("ResponsibilityGrid", () => {
  it("keys WBS and decision rows with the same id apart", () => {
    expect(rowKey(wbs)).not.toBe(rowKey(decision));
    const grid = new ResponsibilityGrid(raci, [cell(wbs, 7, "ACCOUNTABLE")]);
    expect(grid.roleAt(wbs, 7)).toBe("ACCOUNTABLE");
    expect(grid.roleAt(decision, 7)).toBeNull();
    expect(grid.roleAt(wbs, 8)).toBeNull();
  });

  it("counts a non-member assignee hint towards the row flags", () => {
    const withHint = new ResponsibilityGrid(raci, [
      cell(wbs, 7, "ACCOUNTABLE"),
      cell(wbs, 9, "RESPONSIBLE", false),
    ]);
    expect(withHint.flagsFor(wbs)).toEqual({ missing: [], duplicated: [] });
    expect(withHint.hintsFor(wbs).map((c) => c.stakeholderId)).toEqual([9]);

    const withoutHint = new ResponsibilityGrid(raci, [cell(wbs, 7, "ACCOUNTABLE")]);
    expect(withoutHint.flagsFor(wbs).missing).toEqual(["RESPONSIBLE"]);
  });

  it("flags an empty row and a doubled single-holder role", () => {
    const grid = new ResponsibilityGrid(raci, [
      cell(decision, 1, "RESPONSIBLE"),
      cell(decision, 2, "ACCOUNTABLE"),
      cell(decision, 4, "ACCOUNTABLE"),
    ]);
    expect(grid.flagsFor(wbs)).toEqual({ missing: ["RESPONSIBLE", "ACCOUNTABLE"], duplicated: [] });
    expect(grid.flagsFor(decision)).toEqual({ missing: [], duplicated: ["ACCOUNTABLE"] });
    expect(grid.hintsFor(decision)).toEqual([]);
  });

  describe("holdersOf", () => {
    const grid = new ResponsibilityGrid(raci, [
      cell(wbs, 7, "ACCOUNTABLE"),
      cell(wbs, 9, "ACCOUNTABLE", false),
      cell(wbs, 8, "CONSULTED"),
      cell(decision, 5, "ACCOUNTABLE"),
    ]);

    it("lists member and non-member holders of the role on the row, once each", () => {
      expect(grid.holdersOf(wbs, "ACCOUNTABLE", 0)).toEqual([7, 9]);
    });

    it("finds a member holder alone and a non-member hint alone", () => {
      expect(grid.holdersOf(wbs, "ACCOUNTABLE", 9)).toEqual([7]);
      expect(grid.holdersOf(wbs, "ACCOUNTABLE", 7)).toEqual([9]);
    });

    it("ignores other roles and other rows", () => {
      expect(grid.holdersOf(wbs, "CONSULTED", 0)).toEqual([8]);
      expect(grid.holdersOf(wbs, "INFORMED", 0)).toEqual([]);
      expect(grid.holdersOf({ kind: "WbsItem", keyDeliverableId: 4 }, "ACCOUNTABLE", 0)).toEqual(
        [],
      );
    });

    it("reads decision rows apart from the WBS row with the same id", () => {
      expect(grid.holdersOf(decision, "ACCOUNTABLE", 0)).toEqual([5]);
      expect(grid.holdersOf(decision, "ACCOUNTABLE", 5)).toEqual([]);
    });
  });
});
