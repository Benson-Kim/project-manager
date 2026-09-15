import { z } from "zod";

/**
 * URL ⇄ list-proc contract (ADR-0006 / ADR-0016). Every list page parses its
 * searchParams with this schema (extended by module filter params) and
 * forwards the values 1:1 to its usp_<Entity>_List proc.
 */
export const VIEW_MODES = ["grid", "list"] as const;
export type ViewMode = (typeof VIEW_MODES)[number];

export const listParamsSchema = z.object({
  q: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((v) => (v ? v : undefined)),
  sort: z.string().trim().max(50).optional(),
  dir: z.enum(["asc", "desc"]).default("asc"),
  view: z.enum(VIEW_MODES).optional(),
  page: z.coerce.number().int().min(1).default(1),
});

export type ListParams = z.infer<typeof listParamsSchema>;

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

/** Parse (and clamp) list params from a page's searchParams. */
export function parseListParams(
  searchParams: Record<string, string | string[] | undefined>,
): ListParams {
  const parsed = listParamsSchema.safeParse(flattenSearchParams(searchParams));
  // Malformed URLs degrade to defaults rather than erroring the page.
  return parsed.success ? parsed.data : listParamsSchema.parse({});
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
