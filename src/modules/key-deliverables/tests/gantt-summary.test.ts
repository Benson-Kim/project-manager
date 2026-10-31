import { describe, expect, it } from "vitest";
import { ganttSummary } from "../components/gantt-summary";
import { buildWbs, type WbsItem, type WbsRequirement } from "../schemas/wbs";

const day = (d: number) => new Date(Date.UTC(2026, 0, d));

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

function req(id: number, isMet: boolean): WbsRequirement {
  return {
    id,
    type: "FR",
    ref: `FR-${id}`,
    text: `R${id}`,
    isMet,
    sortOrder: id,
    rowVer: id,
    placeRowVer: id,
    parentId: null,
    moscow: null,
    criteria: null,
    estimateDays: null,
    ownerId: null,
    ownerName: null,
  };
}

describe("ganttSummary", () => {
  it("names the project, then every item in breakdown order, indented by level", () => {
    const text = ganttSummary(
      "Clinic",
      buildWbs([
        item(1, null, { name: "Design" }),
        item(2, 1, {
          name: "Wireframes",
          start: day(5),
          end: day(20),
          priority: "Critical",
          requirements: [req(1, true), req(2, false)],
        }),
        item(3, 1, { name: "Review", start: day(21), end: day(21) }),
        item(4, null, { name: "Launch", start: day(30), end: day(30), isMilestone: true }),
      ]),
    );
    expect(text.split("\n")).toEqual([
      "Clinic",
      "1 Design: 25%, 2026-01-05 – 2026-01-21",
      "  1.1 Wireframes: 50%, 2026-01-05 – 2026-01-20, Critical",
      "  1.2 Review: 0%, 2026-01-21",
      "2 Launch: milestone 2026-01-30",
    ]);
  });

  it("says when an item has no dates or no name", () => {
    const text = ganttSummary("P", buildWbs([item(7, null, { name: "" })]));
    expect(text).toMatch(/^P\n1 .+: 0%, No dates$/);
  });
});
