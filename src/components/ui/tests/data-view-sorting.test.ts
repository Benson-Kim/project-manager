import { describe, expect, it } from "vitest";
import { ariaSort, headerSort, sortTokenOf } from "../data-view/sorting";
import type { DataViewColumn } from "../data-view/types";
import { nextSortDir, parseListParams, resolveSort, type ListSort } from "@/lib/list-params";

/**
 * The order a list header shows and the one a click asks for (client feedback,
 * 2026-10-23). Both are pure: the arrow's state is derived from the URL and the
 * module's `ListSort`, never from anything the browser holds, so a column that
 * the proc would ignore can be proven to carry no control at all.
 */
const SORT: ListSort = { columns: ["Status", "DueDate"], default: "DueDate" };

function column(
  key: string,
  extra: Partial<DataViewColumn<unknown>> = {},
): DataViewColumn<unknown> {
  return { key, header: key, priority: 1, render: () => null, ...extra };
}

describe("sortTokenOf", () => {
  it("asks for the column key by default", () => {
    expect(sortTokenOf(column("DueDate"))).toBe("DueDate");
  });

  it("asks for the declared token when the key is named differently", () => {
    // A layout key is stored per user (migration 019), so it cannot be renamed
    // to match a proc column: "ActivityStatus" asks the proc for "Status".
    expect(sortTokenOf(column("ActivityStatus", { sort: "Status" }))).toBe("Status");
  });
});

describe("headerSort", () => {
  const current = { sort: "DueDate", dir: "asc" as const };

  it("gives no control to a column the module does not offer", () => {
    expect(headerSort(column("Comments"), SORT, current)).toBeNull();
  });

  it("gives no control at all when the module passes no ListSort", () => {
    expect(headerSort(column("DueDate"), undefined, current)).toBeNull();
  });

  it("marks the column the list is ordered by", () => {
    expect(headerSort(column("DueDate"), SORT, current)).toEqual({ active: "asc", next: "desc" });
  });

  it("leaves the other sortable columns unmarked, starting ascending", () => {
    expect(headerSort(column("Status"), SORT, current)).toEqual({ active: null, next: "asc" });
  });

  it("reverses a descending column back to ascending", () => {
    const state = headerSort(column("DueDate"), SORT, { sort: "DueDate", dir: "desc" });
    expect(state).toEqual({ active: "desc", next: "asc" });
  });

  it("marks a renamed column by the token, not the key", () => {
    const state = headerSort(column("ActivityStatus", { sort: "Status" }), SORT, {
      sort: "Status",
      dir: "desc",
    });
    expect(state).toEqual({ active: "desc", next: "asc" });
  });
});

describe("ariaSort", () => {
  it.each([
    [null, undefined],
    [{ active: null, next: "asc" as const }, "none"],
    [{ active: "asc" as const, next: "desc" as const }, "ascending"],
    [{ active: "desc" as const, next: "asc" as const }, "descending"],
  ])("%o is announced as %s", (state, expected) => {
    expect(ariaSort(state)).toBe(expected);
  });
});

describe("resolveSort", () => {
  it("keeps a column the module offers", () => {
    expect(resolveSort(SORT, { sort: "Status", dir: "desc" })).toEqual({
      sort: "Status",
      dir: "desc",
    });
  });

  it("drops a column the proc would ignore, so no arrow promises it", () => {
    expect(resolveSort(SORT, { sort: "Comments'; DROP", dir: null })).toEqual({
      sort: "DueDate",
      dir: "asc",
    });
  });

  it("falls back to the proc's own order when the module has no default", () => {
    const catalog: ListSort = { columns: ["Requirement"], default: null };
    expect(resolveSort(catalog, { sort: null, dir: null }).sort).toBeUndefined();
  });

  it("applies the module's default direction, and lets the URL override it", () => {
    const newest: ListSort = {
      columns: ["RequestDate"],
      default: "RequestDate",
      defaultDir: "desc",
    };
    expect(resolveSort(newest, { sort: null, dir: null }).dir).toBe("desc");
    expect(resolveSort(newest, { sort: null, dir: "asc" }).dir).toBe("asc");
  });

  it("ignores a direction that is neither asc nor desc", () => {
    expect(resolveSort(SORT, { sort: "Status", dir: "sideways" }).dir).toBe("asc");
  });
});

describe("nextSortDir", () => {
  it("reverses the column already sorted ascending", () => {
    expect(nextSortDir("Status", { sort: "Status", dir: "asc" })).toBe("desc");
  });

  it("starts any other column ascending", () => {
    expect(nextSortDir("DueDate", { sort: "Status", dir: "desc" })).toBe("asc");
    expect(nextSortDir("Status", { sort: "Status", dir: "desc" })).toBe("asc");
  });
});

describe("parseListParams resolves the order with the module's contract", () => {
  it("validates the URL's column against the module", () => {
    expect(parseListParams({ sort: "Bogus" }, SORT).sort).toBe("DueDate");
    expect(parseListParams({ sort: "Status" }, SORT).sort).toBe("Status");
  });

  it("leaves the order alone when no contract is given", () => {
    // The pages that pass no ListSort send the proc whatever the URL says; the
    // proc compares it in ORDER BY CASE and ignores what it does not know.
    expect(parseListParams({ sort: "Bogus" }).sort).toBe("Bogus");
  });

  it("still degrades a malformed URL to the defaults", () => {
    const params = parseListParams({ page: "nonsense", sort: "Status" }, SORT);
    expect(params.page).toBe(1);
    expect(params.sort).toBe("Status");
  });
});
