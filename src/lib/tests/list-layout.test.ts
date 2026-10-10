import { describe, expect, it } from "vitest";
import {
  clampRowHeight,
  clampWidth,
  COLUMN_WIDTH_MAX,
  COLUMN_WIDTH_MIN,
  moveKey,
  normalizeLayout,
  orderColumns,
  parseListLayout,
  ROW_HEIGHT_MAX,
  ROW_HEIGHT_MIN,
} from "../list-layout";
import { initialViewOf } from "../list-params";

const cols = ["Project", "Requester", "Task", "Status"].map((key) => ({ key }));
const keys = (columns: { key: string }[]) => columns.map((c) => c.key);

describe("datasheet layout (ADR-0023, migration 019)", () => {
  it("keeps the default order without a stored order", () => {
    expect(keys(orderColumns(cols, null))).toEqual(["Project", "Requester", "Task", "Status"]);
    expect(keys(orderColumns(cols, []))).toEqual(["Project", "Requester", "Task", "Status"]);
  });

  it("applies a stored order, ignoring unknown and repeated keys", () => {
    expect(
      keys(orderColumns(cols, ["Status", "Gone", "Task", "Status", "Requester", "Project"])),
    ).toEqual(["Status", "Task", "Requester", "Project"]);
  });

  it("puts a column missing from the order right after its default predecessor", () => {
    // Saved on a page without the Project column: Project keeps its first place.
    expect(keys(orderColumns(cols, ["Task", "Requester", "Status"]))).toEqual([
      "Project",
      "Task",
      "Requester",
      "Status",
    ]);
    // A new Status column lands after Task, its default predecessor.
    expect(keys(orderColumns(cols, ["Task", "Project", "Requester"]))).toEqual([
      "Task",
      "Status",
      "Project",
      "Requester",
    ]);
  });

  it("moves a key and ignores out-of-range moves", () => {
    expect(moveKey(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    expect(moveKey(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveKey(["a", "b", "c"], 0, 5)).toEqual(["a", "b", "c"]);
  });

  it("stores only what differs from the default", () => {
    const def = keys(cols);
    expect(normalizeLayout(def, null)).toBeNull();
    expect(normalizeLayout(def, { order: def })).toBeNull();
    expect(normalizeLayout(def, { order: def, widths: {} })).toBeNull();
    expect(normalizeLayout(def, { order: ["Task", ...def.filter((k) => k !== "Task")] })).toEqual({
      order: ["Task", "Project", "Requester", "Status"],
    });
    expect(normalizeLayout(def, { order: def, widths: { Task: 320 }, rowHeight: 64 })).toEqual({
      widths: { Task: 320 },
      rowHeight: 64,
    });
  });

  it("clamps widths and row heights to their limits", () => {
    expect(clampWidth(10)).toBe(COLUMN_WIDTH_MIN);
    expect(clampWidth(5000)).toBe(COLUMN_WIDTH_MAX);
    expect(clampWidth(201.6)).toBe(202);
    expect(clampRowHeight(0)).toBe(ROW_HEIGHT_MIN);
    expect(clampRowHeight(9999)).toBe(ROW_HEIGHT_MAX);
  });

  it("reads a stored layout and drops anything invalid", () => {
    expect(parseListLayout(null)).toBeNull();
    expect(parseListLayout("not json")).toBeNull();
    expect(parseListLayout("{}")).toBeNull();
    expect(parseListLayout('{"order":["Task"],"rowHeight":64}')).toEqual({
      order: ["Task"],
      rowHeight: 64,
    });
    expect(parseListLayout('{"widths":{"Task":5}}')).toBeNull();
    expect(parseListLayout('{"order":["bad key!"]}')).toBeNull();
  });
});

describe("initial list view", () => {
  it("is the URL's, else the saved preference, else the datasheet (list)", () => {
    expect(initialViewOf("grid", "list")).toBe("grid");
    expect(initialViewOf(undefined, "grid")).toBe("grid");
    expect(initialViewOf(undefined, null)).toBe("list");
    expect(initialViewOf(undefined, undefined)).toBe("list");
  });
});
