import { describe, expect, it } from "vitest";
import { messages } from "@/lib/messages";
import {
  SEARCH_DEFAULT_TOP_PER_KIND,
  SEARCH_KINDS,
  SEARCH_KIND_REGISTRY,
  buildSearchHref,
  buildSearchPageHref,
  globalSearchInput,
  groupSearchHits,
  parseKindsParam,
  parseSearchQueryParams,
  searchHitSchema,
  searchProcRowSchema,
} from "../schemas/search";

describe("search schemas and registry", () => {
  it("trims query and rejects strings shorter than 2 or longer than 100 characters", () => {
    expect(globalSearchInput.safeParse({ q: " a " }).success).toBe(false);
    expect(globalSearchInput.safeParse({ q: "   " }).success).toBe(false);
    expect(globalSearchInput.safeParse({ q: "x".repeat(101) }).success).toBe(false);

    const ok = globalSearchInput.parse({ q: "  alpha  " });
    expect(ok.q).toBe("alpha");
    expect(ok.topPerKind).toBe(SEARCH_DEFAULT_TOP_PER_KIND);
  });

  it("normalizes and deduplicates kinds in canonical order", () => {
    const parsed = globalSearchInput.parse({
      q: "acme",
      kinds: ["supplier", "keyword", "supplier"],
    });
    expect(parsed.kinds).toEqual(["keyword", "supplier"]);
    expect(globalSearchInput.safeParse({ q: "acme", kinds: [] }).success).toBe(false);
    expect(globalSearchInput.safeParse({ q: "acme", kinds: ["decision"] }).success).toBe(false);
  });

  it("buildSearchHref encodes query params safely and rejects invalid ids or projectless non-keywords", () => {
    expect(SEARCH_KIND_REGISTRY.keyword.buildHref(null, 19, "AC")).toBeNull();
    expect(() => SEARCH_KIND_REGISTRY.stakeholder.buildHref(null, 5, "Gary")).toThrow();
    expect(() => SEARCH_KIND_REGISTRY.supplier.buildHref(null, 5, "Acme")).toThrow();
    expect(() => buildSearchHref("keywords", 0, 5, "AC")).toThrow();
    expect(() => buildSearchHref("keywords", 2, -1, "AC")).toThrow();
    expect(() => buildSearchHref("keywords/../../etc", 2, 5, "AC")).toThrow();

    expect(SEARCH_KIND_REGISTRY.keyword.buildHref(2, 7, " 50% & more ")).toBe(
      "/projects/2/keywords?q=50%25%20%26%20more&id=7",
    );
    expect(SEARCH_KIND_REGISTRY.stakeholder.buildHref(14, 9, "Gary Cantrall")).toBe(
      "/projects/14/stakeholders?q=Gary%20Cantrall&id=9",
    );
    expect(SEARCH_KIND_REGISTRY.supplier.buildHref(26, 13, "info@gti.test")).toBe(
      "/projects/26/suppliers?q=info%40gti.test&id=13",
    );
  });

  it("enforces projectId === null invariant only for projectless keywords", () => {
    const projectlessKeyword = searchProcRowSchema.parse({
      Kind: "keyword",
      Id: 19,
      ProjectId: null,
      ProjectName: null,
      Title: "AC",
      Snippet: "   ",
    });
    expect(projectlessKeyword.ProjectId).toBeNull();
    expect(projectlessKeyword.Snippet).toBeNull();

    expect(
      searchProcRowSchema.safeParse({
        Kind: "stakeholder",
        Id: 1,
        ProjectId: null,
        ProjectName: null,
        Title: "Gary",
        Snippet: null,
      }).success,
    ).toBe(false);

    expect(
      searchProcRowSchema.safeParse({
        Kind: "supplier",
        Id: 1,
        ProjectId: 2,
        ProjectName: null,
        Title: "Fiverr",
        Snippet: null,
      }).success,
    ).toBe(false);

    expect(
      searchHitSchema.safeParse({
        kind: "keyword",
        id: 19,
        projectId: null,
        projectName: null,
        title: "AC",
        snippet: null,
        href: "/projects/2/keywords?q=AC&id=19",
      }).success,
    ).toBe(false);
  });

  it("groupSearchHits slices to topPerKind and sets hasMore when rawCount > topPerKind", () => {
    const makeKw = (id: number) => ({
      kind: "keyword" as const,
      id,
      projectId: 2,
      projectName: "Alpha",
      title: `Kw ${id}`,
      snippet: null,
      href: `/projects/2/keywords?q=Kw&id=${id}`,
    });
    const result = groupSearchHits("Kw", [makeKw(1), makeKw(2), makeKw(3)], undefined, 2);
    expect(result.groups.map((g) => g.kind)).toEqual([...SEARCH_KINDS]);
    expect(result.groups[0]).toEqual({
      kind: "keyword",
      hits: [makeKw(1), makeKw(2)],
      hasMore: true,
    });
    expect(result.groups[1]).toEqual({ kind: "stakeholder", hits: [], hasMore: false });
  });

  it("parseKindsParam and parseSearchQueryParams safely handle malformed and oversized URL params", () => {
    expect(parseKindsParam(undefined)).toEqual({ ok: true, kinds: undefined });
    expect(parseKindsParam("")).toEqual({ ok: true, kinds: undefined });
    expect(parseKindsParam("supplier, keyword")).toEqual({
      ok: true,
      kinds: ["keyword", "supplier"],
    });
    expect(parseKindsParam("keyword,")).toEqual({ ok: false });
    expect(parseKindsParam(",keyword")).toEqual({ ok: false });
    expect(parseKindsParam("keyword,,supplier")).toEqual({ ok: false });
    expect(parseKindsParam("unknown")).toEqual({ ok: false });

    expect(parseSearchQueryParams({})).toEqual({
      status: "empty",
      q: "",
      kinds: undefined,
      validationError: null,
    });
    expect(parseSearchQueryParams({ q: " a " })).toEqual({
      status: "too_short",
      q: "a",
      kinds: undefined,
      validationError: null,
    });
    expect(parseSearchQueryParams({ q: "x".repeat(101) })).toEqual({
      status: "invalid",
      q: "x".repeat(101),
      kinds: undefined,
      validationError: messages.search.maxLength,
    });
    expect(parseSearchQueryParams({ q: "test", kinds: "keyword," })).toEqual({
      status: "invalid",
      q: "test",
      kinds: undefined,
      validationError: messages.search.invalidKinds,
    });
    expect(parseSearchQueryParams({ q: "  Gary  ", kinds: "stakeholder" })).toEqual({
      status: "ready",
      q: "Gary",
      kinds: ["stakeholder"],
      validationError: null,
    });

    expect(buildSearchPageHref("  Gary ", ["stakeholder"])).toBe(
      "/search?q=Gary&kinds=stakeholder",
    );
    expect(buildSearchPageHref("Gary", ["keyword", "stakeholder", "supplier"])).toBe(
      "/search?q=Gary",
    );
  });
});
