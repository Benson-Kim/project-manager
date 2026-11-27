import { z } from "zod";
import { messages } from "@/lib/messages";

export const SEARCH_KINDS = ["keyword", "stakeholder", "supplier"] as const;
export type SearchKind = (typeof SEARCH_KINDS)[number];

export const SEARCH_MIN_LENGTH = 2;
export const SEARCH_MAX_LENGTH = 100;
export const SEARCH_DEFAULT_TOP_PER_KIND = 25;
export const SEARCH_MAX_TOP_PER_KIND = 25;

export interface SearchKindMeta {
  readonly kind: SearchKind;
  readonly label: () => string;
  readonly routeSegment: "keywords" | "stakeholders" | "suppliers";
  readonly allowProjectless: boolean;
  readonly buildHref: (projectId: number | null, id: number, query: string) => string | null;
}

const SAFE_ROUTE_SEGMENT = /^[a-z-]+$/;

/**
 * Construct a safe relative href to a project module with ?q= and ?id=
 * so the destination register filters and opens the selected detail Sheet.
 */
export function buildSearchHref(
  routeSegment: string,
  projectId: number | null,
  id: number,
  query: string,
  allowProjectless = false,
): string | null {
  if (projectId === null) {
    if (allowProjectless) return null;
    throw new Error(`Search kind "${routeSegment}" requires a projectId`);
  }
  if (!SAFE_ROUTE_SEGMENT.test(routeSegment)) {
    throw new Error(`Invalid search route segment: ${routeSegment}`);
  }
  if (!Number.isInteger(projectId) || projectId <= 0) {
    throw new Error(`Invalid projectId for search hit: ${String(projectId)}`);
  }
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`Invalid record id for search hit: ${String(id)}`);
  }
  return `/projects/${projectId}/${routeSegment}?q=${encodeURIComponent(query.trim())}&id=${id}`;
}

/** Canonical ordered registry of searchable entity kinds (ADR-0073 §3.2). */
export const SEARCH_KIND_REGISTRY: Record<SearchKind, SearchKindMeta> = {
  keyword: {
    kind: "keyword",
    label: () => messages.search.kinds.keyword,
    routeSegment: "keywords",
    allowProjectless: true,
    buildHref: (projectId, id, query) => buildSearchHref("keywords", projectId, id, query, true),
  },
  stakeholder: {
    kind: "stakeholder",
    label: () => messages.search.kinds.stakeholder,
    routeSegment: "stakeholders",
    allowProjectless: false,
    buildHref: (projectId, id, query) =>
      buildSearchHref("stakeholders", projectId, id, query, false),
  },
  supplier: {
    kind: "supplier",
    label: () => messages.search.kinds.supplier,
    routeSegment: "suppliers",
    allowProjectless: false,
    buildHref: (projectId, id, query) => buildSearchHref("suppliers", projectId, id, query, false),
  },
};

export const globalSearchInput = z.object({
  q: z.string().trim().min(SEARCH_MIN_LENGTH).max(SEARCH_MAX_LENGTH),
  kinds: z
    .array(z.enum(SEARCH_KINDS))
    .min(1)
    .max(SEARCH_KINDS.length)
    .transform((items) => SEARCH_KINDS.filter((k) => items.includes(k)))
    .optional(),
  topPerKind: z
    .number()
    .int()
    .min(1)
    .max(SEARCH_MAX_TOP_PER_KIND)
    .default(SEARCH_DEFAULT_TOP_PER_KIND),
});

export type GlobalSearchInput = z.input<typeof globalSearchInput>;
export type GlobalSearchParsed = z.output<typeof globalSearchInput>;

/** Raw row shape returned by dbo.usp_Search_Global. */
export const searchProcRowSchema = z
  .object({
    Kind: z.enum(SEARCH_KINDS),
    Id: z.number().int().positive(),
    ProjectId: z.number().int().positive().nullable(),
    ProjectName: z
      .string()
      .trim()
      .min(1)
      .nullable()
      .optional()
      .transform((v) => v ?? null),
    Title: z.string().trim().min(1),
    Snippet: z
      .string()
      .trim()
      .nullable()
      .optional()
      .transform((v) => (v && v.length > 0 ? v : null)),
  })
  .superRefine((row, ctx) => {
    const meta = SEARCH_KIND_REGISTRY[row.Kind];
    if (row.ProjectId === null) {
      if (!meta.allowProjectless) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Kind "${row.Kind}" cannot be projectless`,
          path: ["ProjectId"],
        });
      }
      if (row.ProjectName !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Projectless hit must have null ProjectName",
          path: ["ProjectName"],
        });
      }
    } else if (row.ProjectName === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Project-backed hit must have a non-empty ProjectName",
        path: ["ProjectName"],
      });
    }
  });

export type SearchProcRow = z.output<typeof searchProcRowSchema>;

export const searchHitSchema = z
  .object({
    kind: z.enum(SEARCH_KINDS),
    id: z.number().int().positive(),
    projectId: z.number().int().positive().nullable(),
    projectName: z.string().trim().min(1).nullable(),
    title: z.string().trim().min(1),
    snippet: z.string().trim().min(1).nullable(),
    href: z.string().startsWith("/projects/").nullable(),
  })
  .superRefine((hit, ctx) => {
    const meta = SEARCH_KIND_REGISTRY[hit.kind];
    if (hit.projectId === null) {
      if (!meta.allowProjectless || hit.projectName !== null || hit.href !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Projectless search hit invariant violated",
        });
      }
    } else if (hit.projectName === null || hit.href === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Project-backed search hit must include projectName and href",
      });
    }
  });

export type SearchHit = z.output<typeof searchHitSchema>;

export interface SearchKindGroup {
  kind: SearchKind;
  hits: SearchHit[];
  hasMore: boolean;
}

export interface GlobalSearchResult {
  query: string;
  groups: SearchKindGroup[];
}

/**
 * Group normalized hits by active kind in registry order, slicing each kind
 * to `topPerKind` and computing `hasMore = rawCount > topPerKind`.
 */
export function groupSearchHits(
  query: string,
  rawHits: readonly SearchHit[],
  requestedKinds: readonly SearchKind[] | undefined,
  topPerKind: number,
): GlobalSearchResult {
  const activeKinds = requestedKinds
    ? SEARCH_KINDS.filter((kind) => requestedKinds.includes(kind))
    : [...SEARCH_KINDS];

  const groups: SearchKindGroup[] = activeKinds.map((kind) => {
    const kindHits = rawHits.filter((hit) => hit.kind === kind);
    return {
      kind,
      hits: kindHits.slice(0, topPerKind),
      hasMore: kindHits.length > topPerKind,
    };
  });

  return { query, groups };
}

const kindSet = new Set<string>(SEARCH_KINDS);

export type SearchKindsParseResult = { ok: true; kinds: SearchKind[] | undefined } | { ok: false };

/** Strictly parse comma-separated ?kinds= query param, rejecting empty or unknown tokens. */
export function parseKindsParam(raw: string | string[] | undefined): SearchKindsParseResult {
  if (raw === undefined) return { ok: true, kinds: undefined };
  const joined = Array.isArray(raw) ? raw.join(",") : raw;
  const trimmed = joined.trim();
  if (trimmed === "") return { ok: true, kinds: undefined };

  const tokens = trimmed.split(",").map((part) => part.trim().toLowerCase());
  if (tokens.some((token) => token.length === 0 || !kindSet.has(token))) {
    return { ok: false };
  }
  const picked = new Set(tokens as SearchKind[]);
  return {
    ok: true,
    kinds: SEARCH_KINDS.filter((kind) => picked.has(kind)),
  };
}

export type SearchPageQueryState =
  | {
      status: "empty" | "too_short";
      q: string;
      kinds: SearchKind[] | undefined;
      validationError: null;
    }
  | {
      status: "invalid";
      q: string;
      kinds: SearchKind[] | undefined;
      validationError: string;
    }
  | {
      status: "ready";
      q: string;
      kinds: SearchKind[] | undefined;
      validationError: null;
    };

/** Safely trim and validate SSR ?q= and ?kinds= params so malformed URLs never throw. */
export function parseSearchQueryParams(
  raw: Record<string, string | string[] | undefined>,
): SearchPageQueryState {
  const rawQ = Array.isArray(raw.q) ? raw.q[0] : raw.q;
  const q = typeof rawQ === "string" ? rawQ.trim() : "";
  const kindsParsed = parseKindsParam(raw.kinds);
  const kinds = kindsParsed.ok ? kindsParsed.kinds : undefined;

  if (!kindsParsed.ok) {
    return {
      status: "invalid",
      q: q.slice(0, SEARCH_MAX_LENGTH),
      kinds: undefined,
      validationError: messages.search.invalidKinds,
    };
  }

  if (q.length > SEARCH_MAX_LENGTH) {
    return {
      status: "invalid",
      q,
      kinds,
      validationError: messages.search.maxLength,
    };
  }

  if (q.length === 0) {
    return { status: "empty", q: "", kinds, validationError: null };
  }

  if (q.length < SEARCH_MIN_LENGTH) {
    return { status: "too_short", q, kinds, validationError: null };
  }

  return { status: "ready", q, kinds, validationError: null };
}

/** Build the /search query string for a given query and optional kind filter. */
export function buildSearchPageHref(query: string, kinds?: readonly SearchKind[]): string {
  const params = new URLSearchParams();
  const trimmed = query.trim();
  if (trimmed) params.set("q", trimmed);
  if (kinds && kinds.length > 0 && kinds.length < SEARCH_KINDS.length) {
    const ordered = SEARCH_KINDS.filter((k) => kinds.includes(k));
    if (ordered.length > 0 && ordered.length < SEARCH_KINDS.length) {
      params.set("kinds", ordered.join(","));
    }
  }
  const qs = params.toString();
  return qs ? `/search?${qs}` : "/search";
}
