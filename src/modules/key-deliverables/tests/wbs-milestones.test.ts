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
    actualDate: null,
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

function milestone(
  id: number,
  parentId: number | null,
  iso: string | null,
  more: Partial<WbsItem> = {},
) {
  const date = iso ? day(iso) : null;
  return item(id, parentId, { isMilestone: true, start: date, end: date, ...more });
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

  /**
   * It was the calendar alone (`date <= today`), so a milestone whose day had passed read as
   * reached whether or not it had happened — the one thing a target date and an actual date
   * together are there to show (migration 055).
   */
  it("counts a milestone as reached only once its actual day is recorded", () => {
    const wbs = buildWbs([
      milestone(1, null, "2026-03-01", { actualDate: day("2026-03-04") }),
      milestone(2, null, "2026-03-01"),
      milestone(3, null, "2026-03-20"),
      milestone(4, null, null),
    ]);
    const chips = milestoneStrip(wbs, today);
    expect(chips.map((chip) => chip.state)).toEqual(["reached", "overdue", "upcoming", "upcoming"]);
    expect(chips.map((chip) => chip.reached)).toEqual([true, false, false, false]);
  });

  it("reports the day it happened beside the day it was aimed at, so a slip can be seen", () => {
    const wbs = buildWbs([milestone(1, null, "2026-03-01", { actualDate: day("2026-03-04") })]);
    expect(milestoneStrip(wbs, today)[0]).toMatchObject({
      date: day("2026-03-01"),
      actual: day("2026-03-04"),
    });
  });

  it("is reached on an actual day still to come, because somebody recorded it", () => {
    const wbs = buildWbs([milestone(1, null, "2026-03-20", { actualDate: day("2026-03-18") })]);
    expect(milestoneStrip(wbs, today)[0]!.state).toBe("reached");
  });

  /** The register's own rule for the word (isOverdue), so the strip and the badges agree. */
  it("is not overdue on its own day, nor once its status says it is finished or dropped", () => {
    const wbs = buildWbs([
      milestone(1, null, "2026-03-10"),
      milestone(2, null, "2026-03-01", { status: "Completed" }),
      milestone(3, null, "2026-03-01", { status: "Cancelled" }),
      milestone(4, null, "2026-03-01", { status: "In Progress" }),
    ]);
    const state = new Map(milestoneStrip(wbs, today).map((chip) => [chip.id, chip.state]));
    expect([state.get(1), state.get(2), state.get(3)]).toEqual([
      "upcoming",
      "upcoming",
      "upcoming",
    ]);
    expect(state.get(4)).toBe("overdue");
  });

  it("has no actual day until one is recorded", () => {
    const wbs = buildWbs([milestone(1, null, "2026-03-01")]);
    expect(milestoneStrip(wbs, today)[0]!.actual).toBeNull();
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
