import { describe, expect, it } from "vitest";
import { flattenSearchParams, parseListParams, toProcListParams, totalPages } from "../list-params";

describe("list URL params ", () => {
  it("applies defaults for an empty URL", () => {
    const params = parseListParams({});
    expect(params).toMatchObject({ dir: "asc", page: 1 });
    expect(params.q).toBeUndefined();
  });

  it("parses and coerces valid params", () => {
    const params = parseListParams({ q: " acme ", sort: "name", dir: "desc", page: "3" });
    expect(params.q).toBe("acme");
    expect(params.sort).toBe("name");
    expect(params.dir).toBe("desc");
    expect(params.page).toBe(3);
  });

  it("degrades malformed URLs to defaults instead of throwing", () => {
    const params = parseListParams({ page: "-4", dir: "sideways" });
    expect(params.page).toBe(1);
    expect(params.dir).toBe("asc");
  });

  it("flattens array-valued searchParams", () => {
    expect(flattenSearchParams({ q: ["a", "b"], sort: "x" })).toEqual({ q: "a", sort: "x" });
  });

  it("maps to the exact proc contract", () => {
    const proc = toProcListParams(parseListParams({ q: "x", sort: "name" }), 50);
    expect(proc).toEqual({ Search: "x", SortBy: "name", SortDir: "asc", Page: 1, PageSize: 50 });
  });

  it("maps empty search to NULL for the proc", () => {
    const proc = toProcListParams(parseListParams({}));
    expect(proc.Search).toBeNull();
    expect(proc.SortBy).toBeNull();
  });

  it("computes total pages with a floor of 1", () => {
    expect(totalPages(0)).toBe(1);
    expect(totalPages(26, 25)).toBe(2);
  });
});
