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
import {
  addWbsItemAction,
  createKeyDeliverableAction,
  deleteKeyDeliverableAction,
  deleteWbsItemAction,
  moveWbsItemAction,
  renameWbsItemAction,
  rescheduleWbsItemAction,
  updateKeyDeliverableAction,
} from "../actions";

function dbRow(overrides: Record<string, unknown> = {}) {
  return {
    KeyDeliverableId: 7,
    ProjectId: 24,
    KeyRequirement: "Fast reports generation",
    Deadline: null,
    AssignedToStakeholderId: null,
    Priority: null,
    Status: null,
    CreatedAtUtc: new Date("2026-01-01T00:00:00Z"),
    UpdatedAtUtc: null,
    RowVer: "10",
    ...overrides,
  };
}

describe("key-deliverables actions", () => {
  beforeEach(() => {
    session = { userId: 7, username: "pm", role: "User" };
    execProc.mockReset();
    revalidatePath.mockClear();
  });

  it("create succeeds from FormData", async () => {
    execProc.mockResolvedValue([dbRow()]);
    const fd = new FormData();
    fd.set("projectId", "24");
    fd.set("keyRequirement", "Fast reports generation");
    fd.set("startDate", "2026-12-01");
    fd.set("deadline", "2026-12-26");
    const result = await createKeyDeliverableAction(fd);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.KeyDeliverableId).toBe(7);
    const [, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(params.ProjectId).toBe(24);
    expect(params.StartDate).toEqual(new Date("2026-12-01"));
    expect(params.Deadline).toEqual(new Date("2026-12-26"));
    expect(params.ActorUserId).toBe(7);
  });

  it("create returns VALIDATION with fieldErrors for an empty requirement", async () => {
    const fd = new FormData();
    fd.set("projectId", "24");
    fd.set("keyRequirement", "  ");
    const result = await createKeyDeliverableAction(fd);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION");
      expect(result.error.fieldErrors?.keyRequirement).toBeDefined();
    }
    expect(execProc).not.toHaveBeenCalled();
  });

  it("create surfaces the proc's FORBIDDEN_ROW when the project level is too low", async () => {
    execProc.mockRejectedValue(
      new AppError("FORBIDDEN_ROW", "Your access to this project does not allow this"),
    );
    const fd = new FormData();
    fd.set("projectId", "24");
    fd.set("keyRequirement", "R");
    fd.set("startDate", "2026-12-01");
    const result = await createKeyDeliverableAction(fd);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN_ROW");
    expect(execProc).toHaveBeenCalledOnce();
  });

  it("update maps a proc CONFLICT to the CONFLICT result", async () => {
    execProc.mockRejectedValue(new AppError("CONFLICT", "modified"));
    const fd = new FormData();
    fd.set("projectId", "24");
    fd.set("keyRequirement", "R");
    fd.set("startDate", "2026-12-01");
    fd.set("keyDeliverableId", "7");
    fd.set("rowVer", "9");
    const result = await updateKeyDeliverableAction(fd);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONFLICT");
  });

  it("delete succeeds for Admin and forwards id + rowVer", async () => {
    session = { userId: 1, username: "admin", role: "Admin" };
    execProc.mockResolvedValue([]);
    const result = await deleteKeyDeliverableAction({ keyDeliverableId: 7, rowVer: 10 });
    expect(result.ok).toBe(true);
    const [proc, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(proc).toBe("usp_KeyDeliverable_Delete");
    expect(params.KeyDeliverableId).toBe(7);
    expect(params.RowVer).toBe(10);
  });

  describe("work breakdown editor", () => {
    function wbsDbRow(overrides: Record<string, unknown> = {}) {
      return {
        KeyDeliverableId: 7,
        ProjectId: 24,
        ParentKeyDeliverableId: null,
        SortOrder: 1,
        KeyRequirement: "New item",
        RequestedDate: null,
        StartDate: new Date("2026-04-16"),
        Deadline: new Date("2026-04-22"),
        Priority: null,
        Status: null,
        Color: null,
        AssigneeNames: null,
        AssigneesJson: null,
        CreatedAtUtc: new Date("2026-01-01T00:00:00Z"),
        ProjectStartDate: null,
        ProjectEndDate: null,
        Stamp: "500",
        RowVer: "10",
        ...overrides,
      };
    }

    it("add creates the item where asked and answers with its id and the whole breakdown", async () => {
      execProc
        .mockResolvedValueOnce([{ ...dbRow({ KeyDeliverableId: 9 }), HasChildren: false }])
        .mockResolvedValueOnce([
          wbsDbRow(),
          wbsDbRow({ KeyDeliverableId: 9, ParentKeyDeliverableId: 7 }),
        ]);
      const result = await addWbsItemAction({
        projectId: 24,
        name: "  New item ",
        parentId: 7,
        afterId: null,
        start: "2026-04-16",
        end: "2026-04-22",
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.id).toBe(9);
        expect(result.data.items.map((i) => i.id)).toEqual([7, 9]);
        expect(result.data.stamp).toBe(500);
      }
      const [proc, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
      expect(proc).toBe("usp_KeyDeliverable_Create");
      expect(params).toMatchObject({
        ProjectId: 24,
        KeyRequirement: "New item",
        StartDate: new Date("2026-04-16"),
        Deadline: new Date("2026-04-22"),
        ParentKeyDeliverableId: 7,
        AfterKeyDeliverableId: null,
        ActorUserId: 7,
      });
      expect(revalidatePath).not.toHaveBeenCalled();
    });

    it("refuses an end before the start, a blank name and a nonsense date without the database", async () => {
      const bad = [
        addWbsItemAction({
          projectId: 24,
          name: "A",
          parentId: null,
          afterId: null,
          start: "2026-04-16",
          end: "2026-04-15",
        }),
        addWbsItemAction({
          projectId: 24,
          name: "   ",
          parentId: null,
          afterId: null,
          start: "2026-04-16",
          end: "2026-04-16",
        }),
        rescheduleWbsItemAction({ id: 7, start: "0001-01-01", end: "2026-04-16", rowVer: 10 }),
        rescheduleWbsItemAction({ id: 7, start: "2026-04-16", end: "2026-04-10", rowVer: 10 }),
        renameWbsItemAction({ id: 7, name: " ", rowVer: 10 }),
        moveWbsItemAction({ id: 7, parentId: null, position: 0, rowVer: 10 }),
        moveWbsItemAction({ id: 7, parentId: -3, position: 1, rowVer: 10 }),
      ];
      for (const result of await Promise.all(bad)) {
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.code).toBe("VALIDATION");
      }
      expect(execProc).not.toHaveBeenCalled();
    });

    it("move, reschedule, rename and delete answer with the breakdown the proc's project has", async () => {
      const calls: [() => Promise<{ ok: boolean }>, string][] = [
        [
          () => moveWbsItemAction({ id: 7, parentId: 3, position: 2, rowVer: 10 }),
          "usp_KeyDeliverable_Move",
        ],
        [
          () =>
            rescheduleWbsItemAction({ id: 7, start: "2026-04-17", end: "2026-04-23", rowVer: 10 }),
          "usp_KeyDeliverable_Reschedule",
        ],
        [
          () => renameWbsItemAction({ id: 7, name: "Walls", rowVer: 10 }),
          "usp_KeyDeliverable_Rename",
        ],
        [() => deleteWbsItemAction({ id: 7, rowVer: 10 }), "usp_KeyDeliverable_Delete"],
      ];
      for (const [run, proc] of calls) {
        execProc.mockReset();
        execProc.mockResolvedValueOnce([{ ProjectId: 24 }]).mockResolvedValueOnce([wbsDbRow()]);
        const result = await run();
        expect(result.ok).toBe(true);
        expect(execProc.mock.calls.map((c) => c[0])).toEqual([
          proc,
          "usp_KeyDeliverable_GanttData",
        ]);
      }
    });

    it("passes on the proc's refusal (another project's parent, a cycle, too deep)", async () => {
      execProc.mockRejectedValue(new AppError("VALIDATION", "The parent is not in this project"));
      const result = await moveWbsItemAction({ id: 7, parentId: 99, position: 1, rowVer: 10 });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("VALIDATION");
    });

    it("needs a signed-in user", async () => {
      session = null;
      const result = await renameWbsItemAction({ id: 7, name: "Walls", rowVer: 10 });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("UNAUTHENTICATED");
      expect(execProc).not.toHaveBeenCalled();
    });
  });
});
