import { DEFAULT_PAGE_SIZE, type ListParams } from "./list-params";

/** The list procs' largest page. */
export const PRINT_PAGE_SIZE = 100;
/** Printing stops after this many pages (2,000 rows), so one click never loads a whole tenant. */
export const PRINT_MAX_PAGES = 20;

/**
 * The rows a list page shows: the page in the URL, or, while it prints (`?print=all`), every row
 * that matches its search and order, fetched a full page at a time.
 */
export async function listForView<Row extends { TotalCount: number }>(
  params: ListParams,
  fetch: (params: ListParams, pageSize: number) => Promise<Row[]>,
): Promise<Row[]> {
  if (params.print !== "all") return fetch(params, DEFAULT_PAGE_SIZE);
  const rows: Row[] = [];
  for (let page = 1; page <= PRINT_MAX_PAGES; page++) {
    const batch = await fetch({ ...params, page }, PRINT_PAGE_SIZE);
    rows.push(...batch);
    if (batch.length < PRINT_PAGE_SIZE || rows.length >= (batch[0]?.TotalCount ?? 0)) break;
  }
  return rows;
}
