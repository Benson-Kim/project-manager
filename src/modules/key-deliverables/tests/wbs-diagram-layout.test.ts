import { describe, expect, it } from "vitest";
import {
  CHART_REM,
  DEFAULT_CHART,
  ZOOM_STEPS,
  branchRows,
  chartPx,
  chartSize,
  chooseBranch,
  dropZoneAt,
  edgeScroll,
  fitZoom,
  isWbsView,
  parseChartSettings,
  serializeChartSettings,
  zoomStep,
  type BranchLayout,
} from "../components/wbs-diagram-layout";
import { buildWbs, type WbsItem } from "../schemas/wbs";

function item(id: number, parentId: number | null, sortOrder: number): WbsItem {
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
    rowVer: 1,
  };
}

/** Items under `parent`, numbered from `first`. */
function kids(parent: number | null, first: number, count: number): WbsItem[] {
  return Array.from({ length: count }, (_, i) => item(first + i, parent, i + 1));
}

const px = chartPx(16);
const none = new Set<number>();
const noChoices = new Map<number, BranchLayout>();

/**
 * The client's example: four top-level items with four to six sub-items
 * each, some of them with their own. 1.2 and 2.1 have sub-items; 3 has two.
 */
const big = buildWbs([
  ...kids(null, 1, 4),
  ...kids(1, 10, 5),
  ...kids(11, 100, 2),
  ...kids(2, 20, 5),
  ...kids(20, 200, 3),
  ...kids(3, 30, 2),
  ...kids(4, 40, 4),
]);

/** Project 2 on the desktop: four top-level items; 3 has 3.1 to 3.3, and 3.2 has 3.2.1. */
const small = buildWbs([...kids(null, 1, 4), ...kids(3, 30, 3), item(300, 31, 1)]);

describe("branchRows", () => {
  it("puts every branch side by side when the chart has room", () => {
    expect(branchRows(big, none, noChoices, 100_000, px)).toEqual(new Set([1, 2, 3, 4, 11, 20]));
  });

  it("lists the big branches and keeps the small ones side by side when it is narrow", () => {
    // About a 1,920 px window: 1,470 px for the chart.
    expect(branchRows(big, none, noChoices, 1470, px)).toEqual(new Set([3]));
  });

  it("keeps a small breakdown side by side at every level on the same window", () => {
    expect(branchRows(small, none, noChoices, 1470, px)).toEqual(new Set([3, 31]));
  });

  it("lists everything below the top level when no branch fits side by side", () => {
    expect(branchRows(big, none, noChoices, 4 * px.slot, px)).toEqual(new Set());
  });

  it("puts a single sub-item under its parent even when the top level overflows", () => {
    // 1 with its one sub-item is narrower side by side than listed.
    const single = buildWbs([...kids(null, 1, 3), item(10, 1, 1)]);
    expect(branchRows(single, none, noChoices, 0, px)).toEqual(new Set([1]));
  });

  it("follows the viewer's choices whatever the width", () => {
    const listed = new Map<number, BranchLayout>([[3, "list"]]);
    expect(branchRows(big, none, listed, 100_000, px).has(3)).toBe(false);
    // 2.1 opens, and so does 2 above it, even on a narrow chart.
    expect(branchRows(big, none, new Map([[20, "row"]]), 0, px)).toEqual(new Set([2, 20]));
    // An item without sub-items has nothing to lay out.
    expect(branchRows(big, none, new Map([[200, "row"]]), 0, px)).toEqual(new Set());
  });

  it("does not reopen a branch listed above a branch set side by side", () => {
    const choices = new Map<number, BranchLayout>([
      [2, "list"],
      [20, "row"],
    ]);
    expect(branchRows(big, none, choices, 100_000, px).has(20)).toBe(false);
  });

  it("does not open collapsed branches", () => {
    expect(branchRows(big, new Set([1, 2]), noChoices, 100_000, px)).toEqual(new Set([3, 4]));
  });
});

describe("chartSize", () => {
  it("adds up slots side by side and steps in a level per listed level", () => {
    const listed = chartSize(big, none, none, px);
    // 1 and 2 list three levels, 3 and 4 two.
    expect(listed.width).toBe(2 * (px.slot + 2 * px.step) + 2 * (px.slot + px.step));
    const open = chartSize(big, none, new Set([1, 2, 3, 4, 11, 20]), px);
    // 1: four boxes and 1.2's two; 2: four and 2.1's three; 3: two; 4: four.
    expect(open.width).toBe((6 + 7 + 2 + 4) * px.slot);
  });

  it("is as tall as the tallest branch", () => {
    const box = px.link + px.box;
    // 2 listed: its box, the line to its list, five boxes, 2.1's line and its three.
    const listed = chartSize(big, none, none, px);
    expect(listed.height).toBe(box + 2 * px.link + 8 * (px.listGap + px.box));
    const open = chartSize(big, none, new Set([1, 2, 3, 4, 11, 20]), px);
    expect(open.height).toBe(3 * box + 2 * px.link);
  });
});

describe("chooseBranch", () => {
  it("opens the branches above one set side by side", () => {
    const choices = chooseBranch(big, new Map([[2, "list"]]), 20, "row");
    expect([...choices]).toEqual([[20, "row"]]);
  });

  it("drops side-by-side choices below a branch that is listed", () => {
    const choices = chooseBranch(
      big,
      new Map<number, BranchLayout>([
        [20, "row"],
        [11, "row"],
      ]),
      2,
      "list",
    );
    expect([...choices]).toEqual([
      [11, "row"],
      [2, "list"],
    ]);
  });

  it("forgets the choice on automatic", () => {
    expect(chooseBranch(big, new Map([[3, "row"]]), 3, "auto").size).toBe(0);
  });
});

describe("zoom", () => {
  it("steps in and out and stops at the ends", () => {
    expect(zoomStep(1, 1)).toBe(1.1);
    expect(zoomStep(1, -1)).toBe(0.9);
    expect(zoomStep(ZOOM_STEPS[0], -1)).toBe(ZOOM_STEPS[0]);
    expect(zoomStep(ZOOM_STEPS[ZOOM_STEPS.length - 1], 1)).toBe(1.5);
  });

  it("fits at the largest step up to actual size, else the smallest", () => {
    expect(fitZoom(() => true)).toBe(1);
    expect(fitZoom((zoom) => zoom <= 0.8)).toBe(0.8);
    expect(fitZoom(() => false)).toBe(ZOOM_STEPS[0]);
  });
});

describe("chart settings", () => {
  it("round-trips through storage", () => {
    const settings = {
      width: 2400,
      zoom: 0.8,
      branches: new Map<number, BranchLayout>([
        [3, "row"],
        [4, "list"],
      ]),
    };
    expect(parseChartSettings(JSON.parse(serializeChartSettings(settings)))).toEqual(settings);
  });

  it("refuses malformed pieces one by one", () => {
    expect(parseChartSettings(null)).toEqual(DEFAULT_CHART);
    expect(
      parseChartSettings({
        width: -5,
        zoom: 0.33,
        branches: [
          [1, "row"],
          ["x", "row"],
          [2, "up"],
        ],
      }),
    ).toEqual({ width: null, zoom: 1, branches: new Map([[1, "row"]]) });
  });
});

describe("chartPx", () => {
  it("is CHART_REM at the root font size, with the tallest box when known", () => {
    expect(chartPx(16).slot).toBe((CHART_REM.box + 2 * CHART_REM.gap) * 16);
    expect(chartPx(16).box).toBe(CHART_REM.boxMin * 16);
    expect(chartPx(16, 90).box).toBe(90);
  });
});

const box = { left: 100, top: 50, width: 200, height: 60 };

describe("dropZoneAt", () => {
  it("side by side, the left and right edges drop in front and behind", () => {
    expect(dropZoneAt(box, 110, 80, "row")).toBe("before");
    expect(dropZoneAt(box, 290, 80, "row")).toBe("after");
    expect(dropZoneAt(box, 200, 80, "row")).toBe("into");
  });

  it("in a list, the top and bottom edges do", () => {
    expect(dropZoneAt(box, 200, 52, "column")).toBe("before");
    expect(dropZoneAt(box, 200, 108, "column")).toBe("after");
    expect(dropZoneAt(box, 110, 80, "column")).toBe("into");
  });

  it("the project box only takes items", () => {
    expect(dropZoneAt(box, 101, 51, "root")).toBe("into");
  });

  it("does not divide by zero on a box that has not been laid out", () => {
    expect(dropZoneAt({ left: 0, top: 0, width: 0, height: 0 }, 0, 0, "row")).toBe("before");
  });
});

describe("edgeScroll", () => {
  it("scrolls toward an edge the pointer is near, faster the closer it is", () => {
    expect(edgeScroll(500, 0, 1000)).toBe(0);
    expect(edgeScroll(10, 0, 1000)).toBe(-8);
    expect(edgeScroll(0, 0, 1000)).toBe(-10);
    expect(edgeScroll(990, 0, 1000)).toBe(8);
  });

  it("caps the speed once the pointer is past the edge", () => {
    expect(edgeScroll(-400, 0, 1000)).toBe(-20);
    expect(edgeScroll(1400, 0, 1000)).toBe(20);
  });
});

describe("isWbsView", () => {
  it("accepts only the two views", () => {
    expect(isWbsView("wbs")).toBe(true);
    expect(isWbsView("gantt")).toBe(true);
    expect(isWbsView("chart")).toBe(false);
    expect(isWbsView(undefined)).toBe(false);
  });
});
