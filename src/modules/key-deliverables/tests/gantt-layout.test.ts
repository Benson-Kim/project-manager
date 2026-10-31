import { describe, expect, it } from "vitest";
import { buildWbs, type WbsItem } from "../schemas/wbs";
import type { Timeline } from "../components/gantt-scale";
import {
  CARD_GAP_PX,
  CARD_MIN_PX,
  GANTT_DISPLAY,
  MILESTONE_PX,
  cardOf,
  cardTiles,
  ganttLayout,
  ganttRole,
  lineGaps,
  packLines,
  readGanttDisplay,
  requirementTally,
  type GanttEntry,
} from "../components/gantt-layout";

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

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

function dated(id: number, parentId: number | null, from: string, to: string) {
  return item(id, parentId, { start: day(from), end: day(to) });
}

const timeline: Timeline = {
  scale: "week",
  start: day("2026-01-01"),
  days: 100,
  pxPerDay: 10,
  width: 1000,
};

const ids = (lines: GanttEntry[][]) => lines.map((line) => line.map((e) => e.id));

describe("ganttRole", () => {
  const wbs = buildWbs([
    item(1, null),
    item(2, 1),
    item(3, 2),
    item(4, 3),
    item(5, 4),
    item(6, null),
    item(7, 1),
  ]);
  const role = (id: number) => ganttRole(wbs.nodes.get(id)!);

  it("makes groups, lanes, cards and tiles by level and sub-items", () => {
    expect(role(1)).toBe("group");
    expect(role(2)).toBe("lane");
    expect(role(3)).toBe("card");
    expect(role(4)).toBe("tile");
    expect(role(5)).toBe("tile");
    expect(role(6)).toBe("card");
    expect(role(7)).toBe("card");
  });

  it("finds the card that shows an item, none for a group or lane", () => {
    expect(cardOf(wbs, 5)).toBe(3);
    expect(cardOf(wbs, 3)).toBe(3);
    expect(cardOf(wbs, 7)).toBe(7);
    expect(cardOf(wbs, 2)).toBeNull();
    expect(cardOf(wbs, 1)).toBeNull();
  });

  it("lists a card's tiles depth first with their depth under it", () => {
    expect(cardTiles(wbs, 3)).toEqual([
      { id: 4, depth: 1 },
      { id: 5, depth: 2 },
    ]);
    expect(cardTiles(wbs, 7)).toEqual([]);
  });
});

describe("ganttLayout", () => {
  it("puts a group's own cards in an unnamed lane first, then a lane per sub-item with sub-items", () => {
    const wbs = buildWbs([
      item(1, null),
      item(2, 1),
      dated(3, 2, "2026-01-01", "2026-01-31"),
      dated(4, 1, "2026-02-01", "2026-02-10"),
      item(5, 1),
      dated(6, 5, "2026-01-05", "2026-01-06"),
    ]);
    const { groups } = ganttLayout(wbs, timeline);
    expect(groups).toHaveLength(1);
    expect(groups[0].id).toBe(1);
    expect(groups[0].lanes.map((l) => [l.id, l.parentId])).toEqual([
      [null, 1],
      [2, 2],
      [5, 5],
    ]);
    expect(ids(groups[0].lanes[0].lines)).toEqual([[4]]);
  });

  it("keeps runs of top-level cards in their own pill-less groups, in breakdown order", () => {
    const wbs = buildWbs([item(1, null), item(2, null), item(3, 2), item(4, null), item(5, null)]);
    const { groups } = ganttLayout(wbs, timeline);
    expect(groups.map((g) => g.id)).toEqual([null, 2, null]);
    expect(groups[0].lanes[0].parentId).toBeNull();
    expect(ids(groups[0].lanes[0].lines)).toEqual([[1]]);
    expect(ids(groups[2].lanes[0].lines)).toEqual([[4], [5]]);
  });

  it("widens short cards to the minimum and keeps them inside the right edge", () => {
    const wbs = buildWbs([
      dated(1, null, "2026-01-11", "2026-01-12"),
      dated(2, null, "2026-04-01", "2026-04-10"),
    ]);
    const [first, last] = ganttLayout(wbs, timeline).groups[0].lanes[0].lines.flat();
    expect(first).toMatchObject({ id: 1, x: 100, width: CARD_MIN_PX, undated: false });
    expect(last.x + last.width).toBe(timeline.width);
  });

  it("draws undated items at the start and milestones as a diamond on their day", () => {
    const wbs = buildWbs([
      item(1, null),
      item(2, null, { isMilestone: true, start: day("2026-02-01"), end: day("2026-02-01") }),
    ]);
    const entries = ganttLayout(wbs, timeline).groups[0].lanes[0].lines.flat();
    expect(entries.find((e) => e.id === 1)).toMatchObject({ x: 0, undated: true, kind: "card" });
    expect(entries.find((e) => e.id === 2)).toMatchObject({
      kind: "milestone",
      x: 31 * 10 + 5 - MILESTONE_PX / 2,
      width: MILESTONE_PX,
    });
  });

  it("is as wide as one card when the timeline is narrower", () => {
    const narrow = { ...timeline, days: 10, width: 100 };
    const wbs = buildWbs([dated(1, null, "2026-01-05", "2026-01-06")]);
    const layout = ganttLayout(wbs, narrow);
    expect(layout.width).toBe(CARD_MIN_PX);
    expect(layout.groups[0].lanes[0].lines[0][0]).toMatchObject({ x: 0, width: CARD_MIN_PX });
  });
});

describe("packLines", () => {
  const entry = (id: number, x: number, width = 100): GanttEntry => ({
    id,
    kind: "card",
    x,
    width,
    undated: false,
  });

  it("puts each entry on the first line it fits, by its left edge", () => {
    expect(
      ids(packLines([entry(1, 0), entry(2, 50), entry(3, 100 + CARD_GAP_PX), entry(4, 160)])),
    ).toEqual([
      [1, 3],
      [2, 4],
    ]);
  });

  it("needs the gap between two cards on a line, and keeps ties in their given order", () => {
    expect(ids(packLines([entry(1, 0), entry(2, 100 + CARD_GAP_PX - 1)]))).toEqual([[1], [2]]);
    expect(ids(packLines([entry(2, 0), entry(1, 0)]))).toEqual([[2], [1]]);
  });
});

describe("display settings", () => {
  it("reads saved flags, taking the defaults for missing or broken ones", () => {
    expect(readGanttDisplay(null)).toEqual(GANTT_DISPLAY);
    expect(readGanttDisplay("x")).toEqual(GANTT_DISPLAY);
    expect(readGanttDisplay({ dates: false, today: "no", extra: true })).toEqual({
      ...GANTT_DISPLAY,
      dates: false,
    });
  });

  it("tallies met requirements", () => {
    expect(requirementTally([{ isMet: true }, { isMet: false }, { isMet: true }])).toEqual({
      met: 2,
      total: 3,
    });
    expect(requirementTally([])).toEqual({ met: 0, total: 0 });
  });
});

describe("lineGaps", () => {
  const entry = (id: number, x: number, width: number): GanttEntry => ({
    id,
    kind: "card",
    x,
    width,
    undated: false,
  });

  it("measures each entry's space from the end of the one before it", () => {
    expect(lineGaps([entry(1, 40, 252), entry(2, 300, 252), entry(3, 560, 24)])).toEqual([
      40, 8, 8,
    ]);
    expect(lineGaps([])).toEqual([]);
  });

  it("never gives a negative gap", () => {
    expect(lineGaps([entry(1, 0, 252), entry(2, 100, 252)])).toEqual([0, 0]);
  });
});
