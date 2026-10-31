import { describe, expect, it } from "vitest";
import { buildWbs, type WbsItem } from "../schemas/wbs";
import { milestoneStrip, stripOnlyIds } from "../schemas/wbs-milestones";

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

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

function milestone(id: number, parentId: number | null, iso: string | null) {
  const date = iso ? day(iso) : null;
  return item(id, parentId, { isMilestone: true, start: date, end: date });
}

describe("milestoneStrip", () => {
  const today = day("2026-03-10");

  it("lists only the milestones, by date, at any depth, the undated last", () => {
    const wbs = buildWbs([
      item(1, null, { start: day("2026-01-01"), end: day("2026-06-30") }),
      milestone(2, 1, "2026-05-01"),
      milestone(3, null, null),
      milestone(4, null, "2026-02-01"),
      item(5, 1),
      milestone(6, 5, "2026-03-15"),
    ]);
    expect(milestoneStrip(wbs, today).map((chip) => chip.id)).toEqual([4, 6, 2, 3]);
    expect(milestoneStrip(wbs, today).find((chip) => chip.id === 6)).toMatchObject({
      code: "1.2.1",
      name: "Item 6",
      date: day("2026-03-15"),
    });
  });

  it("counts a milestone as reached on its day and after, never without a date", () => {
    const wbs = buildWbs([
      milestone(1, null, "2026-03-09"),
      milestone(2, null, "2026-03-10"),
      milestone(3, null, "2026-03-11"),
      milestone(4, null, null),
    ]);
    expect(milestoneStrip(wbs, today).map((chip) => chip.reached)).toEqual([
      true,
      true,
      false,
      false,
    ]);
  });

  it("is empty without milestones", () => {
    expect(milestoneStrip(buildWbs([item(1, null)]), today)).toEqual([]);
  });
});

describe("stripOnlyIds", () => {
  const wbs = buildWbs([
    item(1, null),
    milestone(2, 1, "2026-05-01"),
    milestone(3, null, "2026-06-30"),
    milestone(4, null, null),
    item(5, 4),
    milestone(6, null, "2026-10-15"),
  ]);

  it("takes the top-level milestones with nothing under them out of the tree", () => {
    const chips = milestoneStrip(wbs, day("2026-03-10"));
    expect([...stripOnlyIds(wbs, chips)].sort()).toEqual([3, 6]);
  });

  it("keeps every box when the strip is hidden", () => {
    expect(stripOnlyIds(wbs, []).size).toBe(0);
  });
});
