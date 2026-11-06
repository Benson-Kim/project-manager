import { describe, expect, it } from "vitest";
import { selectAllState, toggleAll } from "../data-view/selection";

describe("selectAllState", () => {
  it("reads none, some or all of the rows on screen", () => {
    expect(selectAllState([], [1, 2, 3])).toBe("none");
    expect(selectAllState([2], [1, 2, 3])).toBe("some");
    expect(selectAllState([3, 1, 2], [1, 2, 3])).toBe("all");
  });

  it("ignores selected rows that are not on screen", () => {
    expect(selectAllState([9], [1, 2])).toBe("none");
    expect(selectAllState([9, 1, 2], [1, 2])).toBe("all");
  });

  it("reads none when no rows are shown", () => {
    expect(selectAllState([1], [])).toBe("none");
  });
});

describe("toggleAll", () => {
  it("selects every row on screen and keeps the order of the earlier picks", () => {
    expect(toggleAll([], ["a", "b"])).toEqual(["a", "b"]);
    expect(toggleAll(["b"], ["a", "b", "c"])).toEqual(["b", "a", "c"]);
  });

  it("clears the rows on screen when all are selected, keeping others", () => {
    expect(toggleAll([9, 1, 2], [1, 2])).toEqual([9]);
  });

  it("never selects a row twice", () => {
    const next = toggleAll([1], [1, 2]);
    expect(next).toEqual([1, 2]);
    expect(new Set(next).size).toBe(next.length);
  });
});
