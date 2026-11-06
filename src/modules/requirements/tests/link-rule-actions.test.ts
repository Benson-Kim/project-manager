import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/lib/auth/types";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));

let session: Session | null = { userId: 1, username: "admin", role: "Admin" };
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

vi.mock("../repository/requirements", () => ({ setLinkRule: vi.fn() }));

import { revalidatePath } from "next/cache";
import { AppError } from "@/lib/errors";
import { resetRateLimits } from "@/lib/rate-limit";
import { setLinkRuleAction } from "../actions";
import { setLinkRule } from "../repository/requirements";
import { withLinkRule, type LinkRule } from "../schemas/link-rules";

const CELL = { downstreamType: "BR", upstreamType: "TC", allowed: true } as const;

beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimits();
  session = { userId: 1, username: "admin", role: "Admin" };
});

describe("setLinkRuleAction", () => {
  it("lets an Admin change one rule, as themselves, and refreshes the pages that read rules", async () => {
    vi.mocked(setLinkRule).mockResolvedValue();
    const result = await setLinkRuleAction(CELL);
    expect(result.ok).toBe(true);
    expect(setLinkRule).toHaveBeenCalledWith(CELL, 1);
    expect(revalidatePath).toHaveBeenCalledWith("/settings/link-rules");
    expect(revalidatePath).toHaveBeenCalledWith("/projects/[id]/requirements", "page");
  });

  it("refuses a User before the repository is reached", async () => {
    session = { userId: 2, username: "pm", role: "User" };
    const result = await setLinkRuleAction(CELL);
    expect(result).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(setLinkRule).not.toHaveBeenCalled();
  });

  it("refuses a request with no session", async () => {
    session = null;
    const result = await setLinkRuleAction(CELL);
    expect(result).toMatchObject({ ok: false, error: { code: "UNAUTHENTICATED" } });
    expect(setLinkRule).not.toHaveBeenCalled();
  });

  it("never takes the actor from the request", async () => {
    vi.mocked(setLinkRule).mockResolvedValue();
    await setLinkRuleAction({ ...CELL, actorUserId: 99 } as typeof CELL);
    expect(setLinkRule).toHaveBeenCalledWith(CELL, 1);
  });

  it.each([
    ["a WBS row", { ...CELL, downstreamType: "WBS" }],
    ["an unknown type", { ...CELL, upstreamType: "XX" }],
    ["a tick that is not a yes or no", { ...CELL, allowed: "1" }],
    ["a missing tick", { downstreamType: "BR", upstreamType: "TC" }],
  ])("refuses %s", async (_name, input) => {
    const result = await setLinkRuleAction(input as typeof CELL);
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    expect(setLinkRule).not.toHaveBeenCalled();
  });

  it("passes on the refusal when the proc says no", async () => {
    vi.mocked(setLinkRule).mockRejectedValue(new AppError("FORBIDDEN", "Only administrators"));
    const result = await setLinkRuleAction(CELL);
    expect(result).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  });
});

describe("withLinkRule", () => {
  const RULES: LinkRule[] = [
    { downstreamType: "FR", upstreamType: "BR" },
    { downstreamType: "TC", upstreamType: "WBS" },
  ];

  it("adds a ticked cell once, even when it was already there", () => {
    const once = withLinkRule(RULES, CELL);
    expect(once).toContainEqual({ downstreamType: "BR", upstreamType: "TC" });
    expect(withLinkRule(once, CELL)).toHaveLength(RULES.length + 1);
  });

  it("clears only the cell it names", () => {
    const left = withLinkRule(RULES, {
      downstreamType: "FR",
      upstreamType: "BR",
      allowed: false,
    });
    expect(left).toEqual([{ downstreamType: "TC", upstreamType: "WBS" }]);
  });

  it("clearing the other end of a pair leaves this end alone", () => {
    const left = withLinkRule(RULES, { downstreamType: "BR", upstreamType: "FR", allowed: false });
    expect(left).toEqual(RULES);
  });
});
