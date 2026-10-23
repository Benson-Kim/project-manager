import { z } from "zod";

/**
 * URL ⇄ list-proc contract. Every list page parses its
 * searchParams with this schema (extended by module filter params) and
 * forwards the values 1:1 to its usp_<Entity>_List proc.
 */
export const VIEW_MODES = ["grid", "list"] as const;
export type ViewMode = (typeof VIEW_MODES)[number];

export const SORT_DIRS = ["asc", "desc"] as const;
export type SortDir = (typeof SORT_DIRS)[number];

/**
 * The view a list page opens in: the URL's `?view=`, else the user's saved
 * preference, else list view — the Access-style datasheet is the default
 * (client feedback §2, ADR-0023); cards stay one click away.
 */
export function initialViewOf(
  urlView: ViewMode | undefined,
  preferred: ViewMode | null | undefined,
): ViewMode {
  return urlView ?? preferred ?? "list";
}

export const listParamsSchema = z.object({
  q: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((v) => (v ? v : undefined)),
  sort: z.string().trim().max(50).optional(),
  dir: z.enum(SORT_DIRS).default("asc"),
  view: z.enum(VIEW_MODES).optional(),
  page: z.coerce.number().int().min(1).default(1),
});

export type ListParams = z.infer<typeof listParamsSchema>;

/**
 * A module's sortable columns: exactly the tokens its `usp_<Entity>_List` proc
 * honours in the `ORDER BY CASE` of the ADR-0016 contract, plus the one it is
 * given when the URL names none.
 *
 * It is one constant per module, declared beside that module's row schema, and
 * it is the only source: the page validates `?sort=` against it, the list
 * header offers exactly these columns, and
 * `src/tests/list-sort-whitelist.test.ts` reads the proc's own ORDER BY and
 * fails the build if the two drift. A token the proc does not honour would
 * otherwise fall through to its tie-breaker, so the arrow would promise an
 * order the server never applied.
 */
export interface ListSort {
  readonly columns: readonly string[];
  /** The proc's own default order when null (e.g. the requirement catalog's). */
  readonly default: string | null;
  /** Which way that default column reads; ascending unless the module says otherwise. */
  readonly defaultDir?: SortDir;
}

/**
 * The order the proc is actually given: the URL's column when the module offers
 * it, else the module's default, and the URL's direction before the module's.
 *
 * An unknown column is dropped rather than passed on — `@SortBy` is only ever
 * compared inside `ORDER BY CASE`, never concatenated, so it is inert either
 * way, but the list must not show an arrow for an order the server did not
 * apply. The page resolves it before calling the proc and the header resolves
 * it again from the same URL, so this is the one rule both read.
 */
export function resolveSort(
  sort: ListSort | undefined,
  url: { sort?: string | null; dir?: string | null },
): { sort?: string; dir: SortDir } {
  const dir = url.dir === "asc" || url.dir === "desc" ? url.dir : undefined;
  if (!sort) return { sort: url.sort ?? undefined, dir: dir ?? "asc" };
  const column = url.sort && sort.columns.includes(url.sort) ? url.sort : sort.default;
  return { sort: column ?? undefined, dir: dir ?? sort.defaultDir ?? "asc" };
}

/** Clicking the column that is already sorted reverses it; any other starts ascending. */
export function nextSortDir(column: string, current: { sort?: string; dir: SortDir }): SortDir {
  return current.sort === column && current.dir === "asc" ? "desc" : "asc";
}

export const DEFAULT_PAGE_SIZE = 25;

/** Raw Next.js searchParams (values may be arrays) → flat record for zod. */
export function flattenSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
): Record<string, string | undefined> {
  const flat: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(searchParams)) {
    flat[key] = Array.isArray(value) ? value[0] : value;
  }
  return flat;
}

/**
 * Parse (and clamp) list params from a page's searchParams. Given the module's
 * `ListSort`, the order is resolved here too, so the page hands the proc a
 * column the proc honours and the direction the module wants by default.
 */
export function parseListParams(
  searchParams: Record<string, string | string[] | undefined>,
  sort?: ListSort,
): ListParams {
  const flat = flattenSearchParams(searchParams);
  const parsed = listParamsSchema.safeParse(flat);
  // Malformed URLs degrade to defaults rather than erroring the page.
  const params = parsed.success ? parsed.data : listParamsSchema.parse({});
  return sort ? { ...params, ...resolveSort(sort, flat) } : params;
}

/** Repository-side helper: proc params for the ADR-0016 list contract. */
export function toProcListParams(params: ListParams, pageSize: number = DEFAULT_PAGE_SIZE) {
  return {
    Search: params.q ?? null,
    SortBy: params.sort ?? null,
    SortDir: params.dir,
    Page: params.page,
    PageSize: pageSize,
  };
}

export function totalPages(totalCount: number, pageSize: number = DEFAULT_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(totalCount / pageSize));
}
