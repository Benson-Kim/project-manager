import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/lib/auth/types";

const revalidatePath = vi.fn();
const updateTag = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
  updateTag: (...args: unknown[]) => updateTag(...args),
}));

let session: Session | null = { userId: 7, username: "pm", role: "User" };
vi.mock("@/lib/auth/provider", () => ({
  auth: {
    getSession: () => Promise.resolve(session),
    requireSession: async () => {
      if (!session) {
        const { AppError } = await import("@/lib/errors");
        throw new AppError("UNAUTHENTICATED", "Sign in to continue");
      }
      return session;
    },
  },
}));

const execProc = vi.fn();
vi.mock("@/lib/db", () => ({
  execProc: (...args: unknown[]) => execProc(...args) as Promise<unknown[]>,
}));

let licenceInactive = false;
vi.mock("@/lib/licence/write-check", () => ({
  refuseIfReadOnly: async () => licenceInactive,
}));

import { AppError } from "@/lib/errors";
import { messages } from "@/lib/messages";
import { resetRateLimits } from "@/lib/rate-limit";
import SearchPage from "@/app/(app)/search/page";
import { searchGlobalAction } from "../actions";
import { SearchWorkspace } from "../components/search-workspace";

describe("searchGlobalAction", () => {
  beforeEach(() => {
    session = { userId: 7, username: "pm", role: "User" };
    licenceInactive = false;
    execProc.mockReset();
    revalidatePath.mockClear();
    updateTag.mockClear();
    resetRateLimits();
  });

  it("authenticates from session, passes topPerKind + 1, and groups project-backed & projectless hits", async () => {
    execProc.mockResolvedValue([
      {
        Kind: "keyword",
        Id: 19,
        ProjectId: null,
        ProjectName: null,
        Title: "AC",
        Snippet: "Acceptance criteria",
      },
      {
        Kind: "stakeholder",
        Id: 1,
        ProjectId: 2,
        ProjectName: "Inventory",
        Title: "Gary Cantrall",
        Snippet: "Developer · Engineering",
      },
    ]);

    const result = await searchGlobalAction({
      q: "  AC  ",
      kinds: ["keyword", "stakeholder"],
      topPerKind: 10,
    });
    expect(result.ok).toBe(true);
    expect(execProc).toHaveBeenCalledWith("usp_Search_Global", {
      ActorUserId: 7,
      Search: "AC",
      Kinds: "keyword,stakeholder",
      TopPerKind: 11,
    });
    if (result.ok) {
      expect(result.data.groups).toEqual([
        {
          kind: "keyword",
          hasMore: false,
          hits: [
            {
              kind: "keyword",
              id: 19,
              projectId: null,
              projectName: null,
              title: "AC",
              snippet: "Acceptance criteria",
              href: null,
            },
          ],
        },
        {
          kind: "stakeholder",
          hasMore: false,
          hits: [
            {
              kind: "stakeholder",
              id: 1,
              projectId: 2,
              projectName: "Inventory",
              title: "Gary Cantrall",
              snippet: "Developer · Engineering",
              href: "/projects/2/stakeholders?q=AC&id=1",
            },
          ],
        },
      ]);
    }
  });

  it("keeps working when the licence is inactive (licence: read)", async () => {
    licenceInactive = true;
    execProc.mockResolvedValue([]);
    const result = await searchGlobalAction({ q: "alpha" });
    expect(result.ok).toBe(true);
    expect(execProc).toHaveBeenCalledWith("usp_Search_Global", {
      ActorUserId: 7,
      Search: "alpha",
      Kinds: null,
      TopPerKind: 26,
    });
  });

  it("rejects unauthenticated callers and short/invalid inputs before touching the DB", async () => {
    session = null;
    const unauth = await searchGlobalAction({ q: "alpha" });
    expect(unauth.ok).toBe(false);
    if (!unauth.ok) expect(unauth.error.code).toBe("UNAUTHENTICATED");
    expect(execProc).not.toHaveBeenCalled();

    session = { userId: 7, username: "pm", role: "User" };
    const tooShort = await searchGlobalAction({ q: " a " });
    expect(tooShort.ok).toBe(false);
    if (!tooShort.ok) expect(tooShort.error.code).toBe("VALIDATION");
    expect(execProc).not.toHaveBeenCalled();

    const badKind = await searchGlobalAction({ q: "alpha", kinds: ["decision"] });
    expect(badKind.ok).toBe(false);
    if (!badKind.ok) expect(badKind.error.code).toBe("VALIDATION");
    expect(execProc).not.toHaveBeenCalled();
  });

  it("computes hasMore from topPerKind + 1 and maps proc errors cleanly", async () => {
    execProc.mockResolvedValue([
      { Kind: "supplier", Id: 1, ProjectId: 2, ProjectName: "P2", Title: "S1", Snippet: null },
      { Kind: "supplier", Id: 2, ProjectId: 2, ProjectName: "P2", Title: "S2", Snippet: null },
      { Kind: "supplier", Id: 3, ProjectId: 2, ProjectName: "P2", Title: "S3", Snippet: null },
    ]);
    const capped = await searchGlobalAction({ q: "sup", kinds: ["supplier"], topPerKind: 2 });
    expect(capped.ok).toBe(true);
    if (capped.ok) {
      expect(capped.data.groups[0]?.hasMore).toBe(true);
      expect(capped.data.groups[0]?.hits.map((h) => h.id)).toEqual([1, 2]);
    }

    execProc.mockRejectedValue(new AppError("FORBIDDEN_ROW", "Unknown or inactive user"));
    const forbidden = await searchGlobalAction({ q: "alpha" });
    expect(forbidden.ok).toBe(false);
    if (!forbidden.ok) expect(forbidden.error.code).toBe("FORBIDDEN_ROW");
  });

  it("rate-limits per user after exceeding the minute action quota", async () => {
    process.env.RATE_LIMIT_ACTIONS_PER_MINUTE = "2";
    try {
      execProc.mockResolvedValue([]);
      expect((await searchGlobalAction({ q: "alpha" })).ok).toBe(true);
      expect((await searchGlobalAction({ q: "alpha" })).ok).toBe(true);
      const third = await searchGlobalAction({ q: "alpha" });
      expect(third.ok).toBe(false);
      if (!third.ok) expect(third.error.code).toBe("RATE_LIMITED");
    } finally {
      delete process.env.RATE_LIMIT_ACTIONS_PER_MINUTE;
    }
  });
});

describe("SearchWorkspace SSR rendering and XSS safety", () => {
  it("renders grouped results with sibling Link + ProjectLink, hasMore banner, and non-navigable projectless cards", () => {
    const html = renderToStaticMarkup(
      React.createElement(SearchWorkspace, {
        initialQuery: "AC",
        initialKinds: undefined,
        initialPrompt: null,
        initialError: null,
        initialResult: {
          query: "AC",
          groups: [
            {
              kind: "keyword",
              hasMore: true,
              hits: [
                {
                  kind: "keyword",
                  id: 23,
                  projectId: null,
                  projectName: null,
                  title: "hey",
                  snippet: "<script>alert(1)</script>",
                  href: null,
                },
                {
                  kind: "keyword",
                  id: 18,
                  projectId: 2,
                  projectName: "Upgrade Inventory",
                  title: "AC",
                  snippet: "Keyword",
                  href: "/projects/2/keywords?q=AC&id=18",
                },
              ],
            },
          ],
        },
      }),
    );

    // Projectless hit renders "No project" without any <a> inside its card.
    const liMatches = html.match(/<li[^>]*data-testid="search-hit-keyword-23"[\s\S]*?<\/li>/) ?? [];
    expect(liMatches).toHaveLength(1);
    expect(liMatches[0]).toContain(messages.search.noProject);
    expect(liMatches[0]).not.toContain("<a ");
    // XSS payload is HTML-escaped as plain text.
    expect(liMatches[0]).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");

    // Project-backed hit renders sibling <a> links (entity link + ProjectLink), never nested.
    const backedLi = html.match(/<li[^>]*data-testid="search-hit-keyword-18"[\s\S]*?<\/li>/) ?? [];
    expect(backedLi).toHaveLength(1);
    expect(backedLi[0]).toContain('href="/projects/2/keywords?q=AC&amp;id=18"');
    expect(backedLi[0]).toContain('href="/projects/2"');
    const firstClose = backedLi[0]!.indexOf("</a>");
    const secondOpen = backedLi[0]!.indexOf("<a ", backedLi[0]!.indexOf("<a ") + 1);
    expect(firstClose).toBeGreaterThan(-1);
    expect(secondOpen).toBeGreaterThan(firstClose);

    // hasMore hint renders.
    expect(html).toContain('data-testid="search-has-more-keyword"');
  });

  it("renders validation errors and min-length prompt cleanly", () => {
    const errHtml = renderToStaticMarkup(
      React.createElement(SearchWorkspace, {
        initialQuery: "test",
        initialKinds: undefined,
        initialPrompt: null,
        initialError: messages.search.invalidKinds,
        initialResult: null,
      }),
    );
    expect(errHtml).toContain('data-testid="search-validation-error"');
    expect(errHtml).toContain(messages.search.invalidKinds);

    const promptHtml = renderToStaticMarkup(
      React.createElement(SearchWorkspace, {
        initialQuery: "a",
        initialKinds: undefined,
        initialPrompt: "too_short",
        initialError: null,
        initialResult: null,
      }),
    );
    expect(promptHtml).toContain('data-testid="search-prompt"');
    expect(promptHtml).toContain(messages.search.minLength);
  });

  it("SearchPage SSR validates oversized ?q= and malformed ?kinds= cleanly without calling DB", async () => {
    execProc.mockReset();

    const oversizedEl = await SearchPage({
      searchParams: Promise.resolve({ q: "x".repeat(101) }),
    });
    const oversizedHtml = renderToStaticMarkup(oversizedEl);
    expect(oversizedHtml).toContain(messages.search.maxLength);
    expect(execProc).not.toHaveBeenCalled();

    const badKindsEl = await SearchPage({
      searchParams: Promise.resolve({ q: "test", kinds: "keyword," }),
    });
    const badKindsHtml = renderToStaticMarkup(badKindsEl);
    expect(badKindsHtml).toContain(messages.search.invalidKinds);
    expect(execProc).not.toHaveBeenCalled();

    const shortEl = await SearchPage({
      searchParams: Promise.resolve({ q: "a" }),
    });
    const shortHtml = renderToStaticMarkup(shortEl);
    expect(shortHtml).toContain(messages.search.minLength);
    expect(execProc).not.toHaveBeenCalled();

    execProc.mockResolvedValue([
      {
        Kind: "supplier",
        Id: 13,
        ProjectId: 26,
        ProjectName: "Marketing",
        Title: "GTI Distributors",
        Snippet: "Eunice · Toronto · Excellent",
      },
    ]);
    const validEl = await SearchPage({
      searchParams: Promise.resolve({ q: "  GTI  ", kinds: "supplier" }),
    });
    const validHtml = renderToStaticMarkup(validEl);
    expect(validHtml).toContain("GTI Distributors");
    expect(execProc).toHaveBeenCalledWith("usp_Search_Global", {
      ActorUserId: 7,
      Search: "GTI",
      Kinds: "supplier",
      TopPerKind: 26,
    });
  });
});
