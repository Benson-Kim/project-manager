import { describe, expect, it, vi } from "vitest";
import { DEFAULT_PAGE_SIZE, parseListParams } from "../list-params";
import { listForView, PRINT_MAX_PAGES, PRINT_PAGE_SIZE } from "../list-print";

type Row = { Id: number; TotalCount: number };

function table(total: number) {
  const rows: Row[] = Array.from({ length: total }, (_, i) => ({ Id: i + 1, TotalCount: total }));
  return vi.fn(async (params: { page: number }, pageSize: number) =>
    rows.slice((params.page - 1) * pageSize, params.page * pageSize),
  );
}

describe("listForView", () => {
  it("fetches only the page in the URL when not printing", async () => {
    const fetch = table(500);
    const rows = await listForView(parseListParams({ page: "2" }), fetch);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]).toEqual([expect.objectContaining({ page: 2 }), DEFAULT_PAGE_SIZE]);
    expect(rows).toHaveLength(DEFAULT_PAGE_SIZE);
  });

  it("fetches every matching row a full page at a time while printing", async () => {
    const fetch = table(250);
    const rows = await listForView(parseListParams({ page: "3", print: "all", q: "x" }), fetch);
    expect(fetch.mock.calls.map(([p, size]) => [p.page, size])).toEqual([
      [1, PRINT_PAGE_SIZE],
      [2, PRINT_PAGE_SIZE],
      [3, PRINT_PAGE_SIZE],
    ]);
    expect(fetch.mock.calls[0]?.[0]).toMatchObject({ q: "x", print: "all" });
    expect(rows.map((r) => r.Id)).toEqual(Array.from({ length: 250 }, (_, i) => i + 1));
  });

  it("stops once the rows reach the total, without asking for an empty page", async () => {
    const fetch = table(PRINT_PAGE_SIZE * 2);
    const rows = await listForView(parseListParams({ print: "all" }), fetch);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(rows).toHaveLength(PRINT_PAGE_SIZE * 2);
  });

  it("returns nothing for an empty list after one fetch", async () => {
    const fetch = table(0);
    expect(await listForView(parseListParams({ print: "all" }), fetch)).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("stops after the page cap however many rows match", async () => {
    const fetch = table(PRINT_PAGE_SIZE * (PRINT_MAX_PAGES + 5));
    const rows = await listForView(parseListParams({ print: "all" }), fetch);
    expect(fetch).toHaveBeenCalledTimes(PRINT_MAX_PAGES);
    expect(rows).toHaveLength(PRINT_PAGE_SIZE * PRINT_MAX_PAGES);
  });

  it("ignores any other print value", async () => {
    const fetch = table(500);
    await listForView(parseListParams({ print: "everything" }), fetch);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[1]).toBe(DEFAULT_PAGE_SIZE);
  });
});
