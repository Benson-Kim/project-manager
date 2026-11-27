import { describe, expect, it } from "vitest";
import { criticalPath } from "../schemas/critical-path";
import { buildWbs, type WbsItem } from "../schemas/wbs";
import type { DependencyType, WbsLink } from "../schemas/wbs-dependencies";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

function item(id: number, parentId: number | null, start?: string, end?: string): WbsItem {
  return {
    id,
    parentId,
    sortOrder: id,
    name: `Item ${id}`,
    requestedDate: null,
    start: start ? d(start) : null,
    end: end ? d(end) : null,
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
    rowVer: id * 100,
  };
}

let nextLinkId = 1;
function link(
  predecessorId: number,
  successorId: number,
  type: DependencyType = "FS",
  lagDays = 0,
) {
  return { id: nextLinkId++, predecessorId, successorId, type, lagDays, rowVer: 1 } as WbsLink;
}

function path(items: WbsItem[], links: WbsLink[]) {
  const result = criticalPath(buildWbs(items), links);
  return { items: [...result.itemIds].sort((a, b) => a - b), links: [...result.linkIds] };
}

describe("criticalPath", () => {
  it("follows a finish-to-start chain to the last finish and leaves parallel work out", () => {
    const ab = link(1, 2);
    const result = path(
      [
        item(1, null, "2026-01-01", "2026-01-05"),
        item(2, null, "2026-01-06", "2026-01-10"),
        item(3, null, "2026-01-01", "2026-01-03"),
      ],
      [ab],
    );
    expect(result).toEqual({ items: [1, 2], links: [ab.id] });
  });

  it("leaves out a predecessor with days to spare before its successor starts", () => {
    const ab = link(1, 2);
    const result = path(
      [item(1, null, "2026-01-01", "2026-01-05"), item(2, null, "2026-01-08", "2026-01-10")],
      [ab],
    );
    expect(result).toEqual({ items: [2], links: [] });
  });

  it("reads lag on finish-to-finish and start-to-start links", () => {
    const ff = link(1, 2, "FF", 2);
    const ss = link(3, 4, "SS", 1);
    expect(
      path(
        [item(1, null, "2026-01-01", "2026-01-10"), item(2, null, "2026-01-01", "2026-01-12")],
        [ff],
      ),
    ).toEqual({ items: [1, 2], links: [ff.id] });
    expect(
      path(
        [item(3, null, "2026-01-01", "2026-01-04"), item(4, null, "2026-01-02", "2026-01-10")],
        [ss],
      ),
    ).toEqual({ items: [3, 4], links: [ss.id] });
  });

  it("marks the summary above a critical item and gives sub-items their parent's latest end", () => {
    const toFinish = link(2, 4);
    const result = path(
      [
        item(1, null),
        item(2, 1, "2026-01-01", "2026-01-05"),
        item(3, 1, "2026-01-01", "2026-01-03"),
        item(4, null, "2026-01-06", "2026-01-20"),
      ],
      [toFinish],
    );
    expect(result).toEqual({ items: [1, 2, 4], links: [toFinish.id] });

    const onSummary = link(5, 7);
    expect(
      path(
        [
          item(5, null),
          item(6, 5, "2026-01-01", "2026-01-05"),
          item(7, null, "2026-01-06", "2026-01-10"),
        ],
        [onSummary],
      ),
    ).toEqual({ items: [5, 6, 7], links: [onSummary.id] });
  });

  it("counts a successor scheduled too early as critical, with its predecessor", () => {
    const broken = link(1, 2);
    expect(
      path(
        [item(1, null, "2026-01-01", "2026-01-05"), item(2, null, "2026-01-03", "2026-01-10")],
        [broken],
      ),
    ).toEqual({ items: [1, 2], links: [broken.id] });
  });

  it("leaves out undated items and the links that touch them", () => {
    const toUndated = link(1, 2);
    expect(path([item(1, null, "2026-01-01", "2026-01-05"), item(2, null)], [toUndated])).toEqual({
      items: [1],
      links: [],
    });
    expect(path([item(1, null), item(2, null)], [])).toEqual({ items: [], links: [] });
  });

  it("reads a start-to-finish link from the predecessor start to the successor finish", () => {
    const tight = link(1, 2, "SF");
    const loose = link(4, 2, "SF");
    const chain = link(2, 3);
    expect(
      path(
        [
          item(1, null, "2026-01-06", "2026-01-08"),
          item(2, null, "2026-01-01", "2026-01-06"),
          item(3, null, "2026-01-07", "2026-01-12"),
          item(4, null, "2026-01-03", "2026-01-05"),
        ],
        [tight, loose, chain],
      ),
    ).toEqual({ items: [1, 2, 3], links: [tight.id, chain.id] });
  });

  it("keeps a lone unlinked item critical when it ends on the last finish", () => {
    const ab = link(1, 2);
    expect(
      path(
        [
          item(1, null, "2026-01-01", "2026-01-05"),
          item(2, null, "2026-01-06", "2026-01-10"),
          item(3, null, "2026-01-04", "2026-01-10"),
          item(4, null, "2026-01-02", "2026-01-06"),
        ],
        [ab],
      ),
    ).toEqual({ items: [1, 2, 3], links: [ab.id] });
  });

  it("marks every chain that ends on the last finish and leaves a shorter chain out", () => {
    const first = link(1, 2);
    const second = link(3, 4);
    const shorter = link(5, 6);
    expect(
      path(
        [
          item(1, null, "2026-01-01", "2026-01-05"),
          item(2, null, "2026-01-06", "2026-01-10"),
          item(3, null, "2026-01-01", "2026-01-04"),
          item(4, null, "2026-01-05", "2026-01-10"),
          item(5, null, "2026-01-01", "2026-01-03"),
          item(6, null, "2026-01-04", "2026-01-08"),
        ],
        [first, second, shorter],
      ),
    ).toEqual({ items: [1, 2, 3, 4], links: [first.id, second.id] });
  });

  it("gives each key deliverable the path that sets its own end", () => {
    const longer = link(2, 3);
    const shorter = link(6, 7);
    expect(
      path(
        [
          item(1, null),
          item(2, 1, "2026-01-01", "2026-01-05"),
          item(3, 1, "2026-01-06", "2026-01-20"),
          item(4, 1, "2026-01-01", "2026-01-03"),
          item(5, null),
          item(6, 5, "2026-01-01", "2026-01-04"),
          item(7, 5, "2026-01-05", "2026-01-10"),
          item(8, 5, "2026-01-01", "2026-01-06"),
        ],
        [longer, shorter],
      ),
    ).toEqual({ items: [1, 2, 3, 6, 7], links: [longer.id, shorter.id] });
  });

  it("marks work in another deliverable that holds up a deliverable's end", () => {
    const across = link(2, 5);
    expect(
      path(
        [
          item(1, null),
          item(2, 1, "2026-01-01", "2026-01-05"),
          item(3, 1, "2026-01-01", "2026-01-12"),
          item(4, null),
          item(5, 4, "2026-01-06", "2026-01-10"),
        ],
        [across],
      ),
    ).toEqual({ items: [1, 2, 3, 5], links: [across.id] });
  });

  it("counts a loop that cannot be met as critical, with the item waiting on it", () => {
    const into = link(1, 2);
    const there = link(2, 3);
    const back = link(3, 2);
    const result = path(
      [
        item(1, null, "2026-01-17", "2026-01-17"),
        item(2, null, "2026-01-18", "2026-01-18"),
        item(3, null, "2026-01-19", "2026-01-19"),
        item(4, null, "2026-01-20", "2026-01-20"),
      ],
      [into, there, back],
    );
    expect(result).toEqual({ items: [1, 2, 3, 4], links: [into.id, there.id, back.id] });
  });

  it("leaves a loop that can be met out while it has days to spare", () => {
    const result = path(
      [
        item(1, null, "2026-01-10", "2026-01-10"),
        item(2, null, "2026-01-10", "2026-01-10"),
        item(3, null, "2026-01-20", "2026-01-20"),
      ],
      [link(1, 2, "SS"), link(2, 1, "SS")],
    );
    expect(result).toEqual({ items: [3], links: [] });
  });

  it("finishes quickly on a long chain closed into a loop", () => {
    const size = 10_000;
    const items = Array.from({ length: size }, (_, i) =>
      item(i + 1, null, "2026-01-05", "2026-01-05"),
    );
    const links = items.map(({ id }) => link(id, (id % size) + 1));
    expect(criticalPath(buildWbs(items), links).itemIds.size).toBe(size);
  });
});
