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

import { AppError } from "@/lib/errors";
import { createRiskIssueAction, deleteRiskIssueAction, updateRiskIssueAction } from "../actions";

function dbRow(overrides: Record<string, unknown> = {}) {
  return {
    RiskIssueId: 1,
    ProjectId: 2,
    Description: "<p>The vendor may be late</p>",
    Category: "Risk",
    DateIdentified: null,
    Status: "Open",
    Priority: null,
    Impact: null,
    Probability: null,
    MitigationPlan: null,
    Owner: null,
    DueDate: null,
    CreatedAtUtc: new Date("2026-01-01T00:00:00Z"),
    UpdatedAtUtc: null,
    RowVer: "42",
    ...overrides,
  };
}

function form(extra: Record<string, string> = {}) {
  const fd = new FormData();
  fd.set("projectId", "2");
  fd.set("description", "<p>The vendor may be late</p>");
  for (const [k, v] of Object.entries(extra)) fd.set(k, v);
  return fd;
}

describe("risks-issues actions", () => {
  beforeEach(() => {
    session = { userId: 7, username: "pm", role: "User" };
    execProc.mockReset();
    revalidatePath.mockClear();
  });

  // ── create ────────────────────────────────────────────────────────────────

  it("create succeeds from FormData", async () => {
    execProc.mockResolvedValue([dbRow()]);
    const result = await createRiskIssueAction(form());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.RiskIssueId).toBe(1);
    const [proc, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(proc).toBe("usp_RiskIssue_Create");
    expect(params.ProjectId).toBe(2);
    expect(params.ActorUserId).toBe(7);
    expect(params).not.toHaveProperty("ActorRole");
  });

  it("create forwards the five list values to the proc", async () => {
    execProc.mockResolvedValue([dbRow()]);
    await createRiskIssueAction(
      form({
        category: "Issue",
        status: "In Progress",
        priority: "Critical",
        impact: "High",
        probability: "Medium",
      }),
    );
    const [, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(params.Category).toBe("Issue");
    expect(params.Status).toBe("In Progress");
    expect(params.Priority).toBe("Critical");
    expect(params.Impact).toBe("High");
    expect(params.Probability).toBe("Medium");
  });

  it("create returns VALIDATION for an empty description", async () => {
    const result = await createRiskIssueAction(form({ description: "<p></p>" }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION");
      expect(result.error.fieldErrors?.description).toBeDefined();
    }
    expect(execProc).not.toHaveBeenCalled();
  });

  it("create returns VALIDATION when the due date precedes the date identified", async () => {
    const result = await createRiskIssueAction(
      form({ dateIdentified: "2026-04-01", dueDate: "2026-03-01" }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION");
    expect(execProc).not.toHaveBeenCalled();
  });

  it("create surfaces the proc's VALIDATION for a value outside the list (ADR-0022)", async () => {
    execProc.mockRejectedValue(new AppError("VALIDATION", "Choose a value from the list"));
    const result = await createRiskIssueAction(form({ category: "Opportunity" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION");
    const [, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(params.Category).toBe("Opportunity");
  });

  it("create surfaces the proc's FORBIDDEN_ROW when the project level is too low", async () => {
    execProc.mockRejectedValue(
      new AppError("FORBIDDEN_ROW", "Your access to this project does not allow this"),
    );
    const result = await createRiskIssueAction(form());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN_ROW");
    expect(execProc).toHaveBeenCalledOnce();
  });

  it("create succeeds for a Contributor (risks-issues is in CONTRIBUTOR_WRITE_MODULES)", async () => {
    session = { userId: 8, username: "contrib", role: "User" };
    execProc.mockResolvedValue([dbRow()]);
    expect((await createRiskIssueAction(form())).ok).toBe(true);
  });

  // ── update ────────────────────────────────────────────────────────────────

  it("update succeeds for a Contributor", async () => {
    session = { userId: 8, username: "contrib", role: "User" };
    execProc.mockResolvedValue([dbRow()]);
    const result = await updateRiskIssueAction(form({ riskIssueId: "1", rowVer: "42" }));
    expect(result.ok).toBe(true);
  });

  it("update maps a rowversion mismatch to CONFLICT", async () => {
    execProc.mockRejectedValue(new AppError("CONFLICT", "RiskIssue was modified by someone else"));
    const result = await updateRiskIssueAction(form({ riskIssueId: "1", rowVer: "41" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONFLICT");
  });

  it("update maps NOT_FOUND when the record was deleted mid-edit", async () => {
    execProc.mockRejectedValue(new AppError("NOT_FOUND", "RiskIssue not found"));
    const result = await updateRiskIssueAction(form({ riskIssueId: "1", rowVer: "42" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
  });

  it("update surfaces the proc's FORBIDDEN_ROW when the project level is too low", async () => {
    execProc.mockRejectedValue(
      new AppError("FORBIDDEN_ROW", "Your access to this project does not allow this"),
    );
    const result = await updateRiskIssueAction(form({ riskIssueId: "1", rowVer: "42" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN_ROW");
  });

  // ── delete ────────────────────────────────────────────────────────────────

  it("delete succeeds and forwards the ids to the proc", async () => {
    execProc.mockResolvedValue([]);
    const result = await deleteRiskIssueAction({ riskIssueId: 1, rowVer: 42 });
    expect(result.ok).toBe(true);
    expect(execProc).toHaveBeenCalledWith("usp_RiskIssue_Delete", {
      RiskIssueId: 1,
      RowVer: 42,
      ActorUserId: 7,
    });
  });

  it("delete maps a rowversion mismatch to CONFLICT", async () => {
    execProc.mockRejectedValue(new AppError("CONFLICT", "RiskIssue was modified by someone else"));
    const result = await deleteRiskIssueAction({ riskIssueId: 1, rowVer: 41 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONFLICT");
  });

  it("delete surfaces the proc's FORBIDDEN_ROW when the project level is too low", async () => {
    execProc.mockRejectedValue(
      new AppError("FORBIDDEN_ROW", "Your access to this project does not allow this"),
    );
    const result = await deleteRiskIssueAction({ riskIssueId: 1, rowVer: 42 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN_ROW");
    expect(execProc).toHaveBeenCalledOnce();
  });
});
