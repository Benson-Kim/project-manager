import { describe, expect, it } from "vitest";
import { buildWbs, type WbsItem } from "../schemas/wbs";
import {
  DEPENDENCY_TYPES,
  LAG_MAX_DAYS,
  LAG_MIN_DAYS,
  applyRelink,
  applyUnlink,
  cascadeEffect,
  cascadeSchedule,
  isDependencyType,
  isLagInRange,
  isSatisfied,
  linkRefusal,
  linksOf,
  linksTouching,
  requiredShiftDays,
  violatedLinks,
  type DependencyType,
  type WbsLink,
} from "../schemas/wbs-dependencies";

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

function link(id: number, predecessorId: number, successorId: number, more: Partial<WbsLink> = {}) {
  return {
    id,
    predecessorId,
    successorId,
    type: "FS" as DependencyType,
    lagDays: 0,
    rowVer: id * 10,
    ...more,
  } satisfies WbsLink;
}

/** Two dated leaves: A on the 1st-5th, B on the 10th-14th. */
function pair(): WbsItem[] {
  return [
    item(1, null, 1, { name: "A", start: d("2026-03-01"), end: d("2026-03-05") }),
    item(2, null, 2, { name: "B", start: d("2026-03-10"), end: d("2026-03-14") }),
  ];
}

const spanOf = (items: readonly WbsItem[], id: number) => {
  const found = items.find((i) => i.id === id)!;
  return [found.start?.toISOString().slice(0, 10), found.end?.toISOString().slice(0, 10)];
};

describe("dependency registry mirrors the database", () => {
  it("knows the four types the CHECK constraint allows", () => {
    expect([...DEPENDENCY_TYPES]).toEqual(["FS", "SS", "FF", "SF"]);
    expect(isDependencyType("FS")).toBe(true);
    expect(isDependencyType("XX")).toBe(false);
  });

  it("bounds the lag the way CK_KeyDeliverableDependency_Lag does", () => {
    expect(isLagInRange(0)).toBe(true);
    expect(isLagInRange(LAG_MIN_DAYS)).toBe(true);
    expect(isLagInRange(LAG_MAX_DAYS)).toBe(true);
    expect(isLagInRange(LAG_MIN_DAYS - 1)).toBe(false);
    expect(isLagInRange(LAG_MAX_DAYS + 1)).toBe(false);
    expect(isLagInRange(1.5)).toBe(false);
  });
});

describe("requiredShiftDays, per type", () => {
  const a = { start: d("2026-03-01"), end: d("2026-03-05") };

  /**
   * The boundary of each type at lag 0, which is the one place FS and SS differ: the ends are
   * inclusive, so an FS successor may not start before the 6th, while an SS one may start on the
   * 1st. Each case gives the successor's own span and the days it must move.
   */
  it.each([
    // FS: the earliest start is the 6th, the day after A ends.
    ["FS", { start: d("2026-03-06"), end: d("2026-03-08") }, 0],
    ["FS", { start: d("2026-03-05"), end: d("2026-03-07") }, 1],
    ["FS", { start: d("2026-03-01"), end: d("2026-03-03") }, 5],
    ["FS", { start: d("2026-03-20"), end: d("2026-03-22") }, 0],
    // SS: the earliest start is A's own start, the 1st.
    ["SS", { start: d("2026-03-01"), end: d("2026-03-03") }, 0],
    ["SS", { start: d("2026-02-26"), end: d("2026-02-28") }, 3],
    // FF: the earliest end is A's end, the 5th.
    ["FF", { start: d("2026-03-01"), end: d("2026-03-05") }, 0],
    ["FF", { start: d("2026-03-01"), end: d("2026-03-02") }, 3],
    // SF: the earliest end is A's start, the 1st.
    ["SF", { start: d("2026-02-20"), end: d("2026-03-01") }, 0],
    ["SF", { start: d("2026-02-20"), end: d("2026-02-25") }, 4],
  ] as const)("%s against a successor ending %o moves it %i days", (type, successor, expected) => {
    expect(requiredShiftDays(type, a, successor, 0)).toBe(expected);
  });

  it("adds a positive lag and takes a negative one as a lead", () => {
    const b = { start: d("2026-03-06"), end: d("2026-03-08") };
    expect(requiredShiftDays("FS", a, b, 0)).toBe(0);
    expect(requiredShiftDays("FS", a, b, 3)).toBe(3);
    expect(requiredShiftDays("FS", a, b, -2)).toBe(0);
  });

  it("never pulls a successor earlier, however much slack there is", () => {
    const late = { start: d("2026-06-01"), end: d("2026-06-05") };
    for (const type of DEPENDENCY_TYPES) {
      expect(requiredShiftDays(type, a, late, 0)).toBe(0);
      expect(requiredShiftDays(type, a, late, -30)).toBe(0);
    }
  });

  it("schedules nothing when either end lacks the dates its type needs", () => {
    const undated = { start: null, end: null };
    for (const type of DEPENDENCY_TYPES) {
      expect(
        requiredShiftDays(type, undated, { start: d("2026-01-01"), end: d("2026-01-02") }, 0),
      ).toBe(0);
      expect(requiredShiftDays(type, a, undated, 0)).toBe(0);
    }
  });
});

describe("cascadeSchedule", () => {
  it("pushes a violated successor to the earliest day its link allows, keeping its length", () => {
    const next = cascadeSchedule(
      pair(),
      [link(1, 1, 2)].map((l) => ({ ...l, lagDays: 0 })),
    );
    // B already starts on the 10th, well after A ends on the 5th: nothing moves.
    expect(spanOf(next, 2)).toEqual(["2026-03-10", "2026-03-14"]);
  });

  it("moves a successor that starts too early, and keeps its duration", () => {
    const items = [
      item(1, null, 1, { start: d("2026-03-01"), end: d("2026-03-05") }),
      item(2, null, 2, { start: d("2026-03-02"), end: d("2026-03-04") }),
    ];
    const next = cascadeSchedule(items, [link(1, 1, 2)]);
    expect(spanOf(next, 2)).toEqual(["2026-03-06", "2026-03-08"]);
  });

  it("carries the push down a chain", () => {
    const items = [
      item(1, null, 1, { start: d("2026-03-01"), end: d("2026-03-05") }),
      item(2, null, 2, { start: d("2026-03-01"), end: d("2026-03-02") }),
      item(3, null, 3, { start: d("2026-03-01"), end: d("2026-03-01") }),
    ];
    const next = cascadeSchedule(items, [link(1, 1, 2), link(2, 2, 3)]);
    expect(spanOf(next, 2)).toEqual(["2026-03-06", "2026-03-07"]);
    expect(spanOf(next, 3)).toEqual(["2026-03-08", "2026-03-08"]);
  });

  it("takes the furthest of several links on one item", () => {
    const items = [
      item(1, null, 1, { start: d("2026-03-01"), end: d("2026-03-05") }),
      item(2, null, 2, { start: d("2026-03-01"), end: d("2026-03-20") }),
      item(3, null, 3, { start: d("2026-03-01"), end: d("2026-03-02") }),
    ];
    const next = cascadeSchedule(items, [link(1, 1, 3), link(2, 2, 3)]);
    expect(spanOf(next, 3)).toEqual(["2026-03-21", "2026-03-22"]);
  });

  it("moves a summary successor as a whole branch", () => {
    const items = [
      item(1, null, 1, { start: d("2026-03-01"), end: d("2026-03-10") }),
      item(2, null, 2),
      item(3, 2, 1, { start: d("2026-03-01"), end: d("2026-03-04") }),
      item(4, 2, 2, { start: d("2026-03-05"), end: d("2026-03-08") }),
    ];
    const next = cascadeSchedule(items, [link(1, 1, 2)]);
    // The branch spans the 1st-8th and must start on the 11th: ten days later.
    expect(spanOf(next, 3)).toEqual(["2026-03-11", "2026-03-14"]);
    expect(spanOf(next, 4)).toEqual(["2026-03-15", "2026-03-18"]);
  });

  it("keeps a milestone one day when it is pushed", () => {
    const items = [
      item(1, null, 1, { start: d("2026-03-01"), end: d("2026-03-05") }),
      item(2, null, 2, { isMilestone: true, start: d("2026-03-02"), end: d("2026-03-02") }),
    ];
    const next = cascadeSchedule(items, [link(1, 1, 2)]);
    expect(spanOf(next, 2)).toEqual(["2026-03-06", "2026-03-06"]);
  });

  it("leaves an undated successor alone rather than guessing a date", () => {
    const items = [
      item(1, null, 1, { start: d("2026-03-01"), end: d("2026-03-05") }),
      item(2, null, 2),
    ];
    expect(cascadeSchedule(items, [link(1, 1, 2)])).toEqual(items);
  });

  it("settles, so running it again changes nothing", () => {
    const items = [
      item(1, null, 1, { start: d("2026-03-01"), end: d("2026-03-05") }),
      item(2, null, 2, { start: d("2026-03-01"), end: d("2026-03-02") }),
      item(3, null, 3, { start: d("2026-03-01"), end: d("2026-03-01") }),
    ];
    const links = [link(1, 1, 2), link(2, 2, 3)];
    const once = cascadeSchedule(items, links);
    expect(cascadeSchedule(once, links)).toEqual(once);
    expect(violatedLinks(links, buildWbs(once))).toEqual([]);
  });

  it("does nothing at all when the project has no links", () => {
    const items = pair();
    expect(cascadeSchedule(items, [])).toEqual(items);
  });
});

describe("cascadeEffect names what a change carries", () => {
  it("counts the items the schedule moves beyond the one being changed", () => {
    const asked = [
      item(1, null, 1, { start: d("2026-03-10"), end: d("2026-03-14") }),
      item(2, null, 2, { start: d("2026-03-01"), end: d("2026-03-02") }),
      item(3, null, 3, { start: d("2026-03-01"), end: d("2026-03-01") }),
    ];
    expect(cascadeEffect(asked, [link(1, 1, 2), link(2, 2, 3)])).toEqual([2, 3]);
  });

  it("is empty when nothing else has to move", () => {
    expect(cascadeEffect(pair(), [link(1, 1, 2)])).toEqual([]);
  });
});

describe("linkRefusal mirrors what the proc refuses under the project lock", () => {
  const items = [
    item(1, null, 1, { start: d("2026-03-01"), end: d("2026-03-05") }),
    item(2, null, 2, { start: d("2026-03-10"), end: d("2026-03-14") }),
    item(3, 2, 1, { start: d("2026-03-10"), end: d("2026-03-11") }),
  ];
  const wbs = buildWbs(items);

  it("refuses an item depending on itself", () => {
    expect(linkRefusal(wbs, [], 1, 1)).toBe("self");
  });

  it("refuses a second link for the same ordered pair", () => {
    expect(linkRefusal(wbs, [link(1, 1, 2)], 1, 2)).toBe("duplicate");
    // The other direction is a different ordered pair, and only a cycle stops it.
    expect(linkRefusal(wbs, [link(1, 1, 2)], 2, 1)).toBe("cycle");
  });

  it("refuses a pair where one item is the summary of the other", () => {
    expect(linkRefusal(wbs, [], 2, 3)).toBe("related");
    expect(linkRefusal(wbs, [], 3, 2)).toBe("related");
  });

  it("refuses a link that would close a loop, however long the chain", () => {
    const chain = [link(1, 1, 2), link(2, 2, 3)];
    expect(linkRefusal(wbs, chain, 3, 1)).toBe("cycle");
  });

  it("allows an unrelated pair", () => {
    expect(linkRefusal(wbs, [], 1, 3)).toBeNull();
  });
});

describe("holding the links the editor shows", () => {
  const links = [link(1, 1, 2), link(2, 2, 3), link(3, 1, 3)];

  it("lists an item's links in both directions", () => {
    expect(linksOf(links, 2)).toEqual({
      predecessors: [link(1, 1, 2)],
      successors: [link(2, 2, 3)],
    });
  });

  it("retypes and re-lags one link, leaving the rest", () => {
    expect(applyRelink(links, 2, "SS", 4)).toEqual([
      link(1, 1, 2),
      { ...link(2, 2, 3), type: "SS", lagDays: 4 },
      link(3, 1, 3),
    ]);
  });

  it("takes one link away", () => {
    expect(applyUnlink(links, 2)).toEqual([link(1, 1, 2), link(3, 1, 3)]);
  });

  it("finds every link a deleted branch takes with it, at either end", () => {
    const items = [item(1, null, 1), item(2, null, 2), item(3, 2, 1)];
    const wbs = buildWbs(items);
    const touching = linksTouching(wbs, [link(1, 1, 3), link(2, 1, 2)], 2);
    expect(touching.map((l) => l.id)).toEqual([1, 2]);
  });

  it("calls a link satisfied only where it holds", () => {
    const wbs = buildWbs(pair());
    expect(isSatisfied(link(1, 1, 2), wbs)).toBe(true);
    expect(isSatisfied(link(2, 1, 2, { lagDays: 30 }), wbs)).toBe(false);
  });
});
