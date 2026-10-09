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

const execProc = vi.fn();
vi.mock("@/lib/db", () => ({
  execProc: (...args: unknown[]) => execProc(...args) as Promise<unknown[]>,
}));

import { AppError } from "@/lib/errors";
import { saveLookupListAction } from "../actions";

const input = {
  listKey: "supplier.rating",
  rowVer: 31,
  options: [{ id: 4, label: "Good" }],
};

describe("saveLookupListAction (ADR-0022)", () => {
  beforeEach(() => {
    execProc.mockReset();
    session = { userId: 1, username: "admin", role: "Admin" };
  });

  it("lets an Admin save a list and returns it", async () => {
    execProc.mockResolvedValue([
      {
        ListKey: "supplier.rating",
        ListRowVer: 32,
        LookupOptionId: 4,
        Label: "Good",
        SortOrder: 1,
        IsLocked: false,
        ListTintRows: false,
        Color: "green",
      },
    ]);
    const result = await saveLookupListAction(input);
    expect(result).toEqual({
      ok: true,
      data: {
        key: "supplier.rating",
        rowVer: 32,
        tintRows: false,
        options: [{ id: 4, label: "Good", locked: false, color: "green" }],
      },
    });
    const [proc, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(proc).toBe("usp_LookupList_Set");
    expect(params.ActorUserId).toBe(1);
  });

  it("is FORBIDDEN for a User before touching the database (lists are shared by all projects)", async () => {
    session = { userId: 7, username: "pm", role: "User" };
    const result = await saveLookupListAction(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
    expect(execProc).not.toHaveBeenCalled();
  });

  it("returns VALIDATION for duplicate names without touching the database", async () => {
    const result = await saveLookupListAction({
      ...input,
      options: [
        { id: 4, label: "Good" },
        { id: null, label: "GOOD" },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.fieldErrors?.["options.1.label"]).toBeDefined();
    expect(execProc).not.toHaveBeenCalled();
  });

  it("surfaces the proc's CONFLICT when the list changed meanwhile", async () => {
    execProc.mockRejectedValue(new AppError("CONFLICT", "The list was changed by someone else"));
    const result = await saveLookupListAction(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONFLICT");
  });
});
