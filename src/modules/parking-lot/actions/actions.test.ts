import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/lib/auth/types";

const revalidatePath = vi.fn();
const updateTag = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
  updateTag: (...args: unknown[]) => updateTag(...args),
}));

let session: Session | null = { userId: 7, username: "pm", role: "ProjectManager" };
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
import {
  createParkingLotItemAction,
  deleteParkingLotItemAction,
  updateParkingLotItemAction,
} from ".";

function dbRow(overrides: Record<string, unknown> = {}) {
  return {
    ParkingLotItemId: 3,
    ProjectId: 2,
    ParkingLotItem: "Something to discuss",
    StakeholderId: 1,
    IsStrikethrough: false,
    CreatedAtUtc: new Date("2026-01-01T00:00:00Z"),
    UpdatedAtUtc: null,
    RowVer: "42",
    ...overrides,
  };
}

describe("parking-lot actions", () => {
  beforeEach(() => {
    session = { userId: 7, username: "pm", role: "ProjectManager" };
    execProc.mockReset();
    revalidatePath.mockClear();
  });

  // ── create ──────────────────────────────────────────────────────────────────

  it("create succeeds from FormData", async () => {
    execProc.mockResolvedValue([dbRow()]);
    const fd = new FormData();
    fd.set("projectId", "2");
    fd.set("parkingLotItem", "Something to discuss");
    const result = await createParkingLotItemAction(fd);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.ParkingLotItemId).toBe(3);
    const [proc, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(proc).toBe("usp_ParkingLotItem_Create");
    expect(params.ProjectId).toBe(2);
    expect(params.ParkingLotItem).toBe("Something to discuss");
    expect(params.ActorUserId).toBe(7);
  });

  it("create returns VALIDATION with fieldErrors for an empty item", async () => {
    const fd = new FormData();
    fd.set("projectId", "2");
    fd.set("parkingLotItem", "  ");
    const result = await createParkingLotItemAction(fd);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION");
      expect(result.error.fieldErrors?.parkingLotItem).toBeDefined();
    }
    expect(execProc).not.toHaveBeenCalled();
  });

  it("create is FORBIDDEN for a Viewer", async () => {
    session = { userId: 9, username: "viewer", role: "Viewer" };
    const fd = new FormData();
    fd.set("projectId", "2");
    fd.set("parkingLotItem", "Something to discuss");
    const result = await createParkingLotItemAction(fd);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
    expect(execProc).not.toHaveBeenCalled();
  });

  it("create succeeds for a Contributor (parking-lot is in CONTRIBUTOR_WRITE_MODULES)", async () => {
    session = { userId: 8, username: "contrib", role: "Contributor" };
    execProc.mockResolvedValue([dbRow()]);
    const fd = new FormData();
    fd.set("projectId", "2");
    fd.set("parkingLotItem", "Something to discuss");
    const result = await createParkingLotItemAction(fd);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.ParkingLotItemId).toBe(3);
  });

  // ── update ───────────────────────────────────────────────────────────────

  it("update succeeds for a Contributor", async () => {
    session = { userId: 8, username: "contrib", role: "Contributor" };
    execProc.mockResolvedValue([dbRow()]);
    const fd = new FormData();
    fd.set("projectId", "2");
    fd.set("parkingLotItem", "Updated item");
    fd.set("parkingLotItemId", "3");
    fd.set("rowVer", "42");
    const result = await updateParkingLotItemAction(fd);
    expect(result.ok).toBe(true);
  });

  it("update maps a rowversion mismatch to CONFLICT", async () => {
    execProc.mockRejectedValue(
      new AppError("CONFLICT", "ParkingLotItem was modified by someone else"),
    );
    const fd = new FormData();
    fd.set("projectId", "2");
    fd.set("parkingLotItem", "Something to discuss");
    fd.set("parkingLotItemId", "3");
    fd.set("rowVer", "41");
    const result = await updateParkingLotItemAction(fd);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONFLICT");
  });

  it("update is FORBIDDEN for a Viewer", async () => {
    session = { userId: 9, username: "viewer", role: "Viewer" };
    const fd = new FormData();
    fd.set("projectId", "2");
    fd.set("parkingLotItem", "Something to discuss");
    fd.set("parkingLotItemId", "3");
    fd.set("rowVer", "42");
    const result = await updateParkingLotItemAction(fd);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
  });

  // ── delete ───────────────────────────────────────────────────────────────

  it("delete succeeds and forwards ids to the proc", async () => {
    execProc.mockResolvedValue([]);
    const result = await deleteParkingLotItemAction({ parkingLotItemId: 3, rowVer: 42 });
    expect(result.ok).toBe(true);
    expect(execProc).toHaveBeenCalledWith("usp_ParkingLotItem_Delete", {
      ParkingLotItemId: 3,
      RowVer: 42,
      ActorUserId: 7,
    });
  });

  it("delete is FORBIDDEN for a Contributor", async () => {
    session = { userId: 8, username: "contrib", role: "Contributor" };
    const result = await deleteParkingLotItemAction({ parkingLotItemId: 3, rowVer: 42 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
    expect(execProc).not.toHaveBeenCalled();
  });

  it("delete is FORBIDDEN for a Viewer", async () => {
    session = { userId: 9, username: "viewer", role: "Viewer" };
    const result = await deleteParkingLotItemAction({ parkingLotItemId: 3, rowVer: 42 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
    expect(execProc).not.toHaveBeenCalled();
  });
});
