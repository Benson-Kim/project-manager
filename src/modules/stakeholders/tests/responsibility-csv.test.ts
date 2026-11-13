import { describe, expect, it } from "vitest";
import { responsibilityCsv } from "../schemas/responsibility-csv";
import { responsibilityFramework } from "../schemas/responsibility-frameworks";
import { ResponsibilityGrid } from "../schemas/responsibility-grid";
import type { ResponsibilityRowRef } from "../schemas/responsibility-matrix";

const raci = responsibilityFramework("RACI");
const a: ResponsibilityRowRef = { kind: "WbsItem", keyDeliverableId: 1 };
const b: ResponsibilityRowRef = { kind: "WbsItem", keyDeliverableId: 2 };

describe("responsibilityCsv", () => {
  it("writes a line per row with the role abbreviations under each member", () => {
    const grid = new ResponsibilityGrid(raci, [
      { row: a, stakeholderId: 7, roleCode: "RESPONSIBLE", isMember: true },
      { row: a, stakeholderId: 8, roleCode: "ACCOUNTABLE", isMember: true },
      { row: b, stakeholderId: 8, roleCode: "INFORMED", isMember: true },
      { row: b, stakeholderId: 9, roleCode: "RESPONSIBLE", isMember: false },
    ]);
    const csv = responsibilityCsv(
      raci,
      "WBS item",
      [
        { stakeholderId: 7, name: "Ann" },
        { stakeholderId: 8, name: "=Bo, Jr" },
      ],
      [
        { ref: a, label: "Design" },
        { ref: b, label: "Build" },
      ],
      grid,
    );
    expect(csv).toBe('﻿WBS item,Ann,"\'=Bo, Jr"\r\nDesign,R,A\r\nBuild,,I\r\n');
  });
});
