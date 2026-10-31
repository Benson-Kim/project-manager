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
  linkWbsItemsAction,
  relinkWbsItemsAction,
  setWbsMilestoneAction,
  unlinkWbsItemsAction,
  updateKeyDeliverableAction,
  updateWbsItemAction,
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

    it("the details panel's update keeps an omitted colour and budget and answers with the breakdown", async () => {
      const base = {
        keyDeliverableId: 7,
        projectId: 24,
        keyRequirement: "Walls",
        startDate: "2026-04-16",
        deadline: "2026-04-22",
        assigneeIds: [3],
        priority: "High",
        status: null,
        rowVer: 10,
      };
      execProc.mockResolvedValueOnce([{ ProjectId: 24 }]).mockResolvedValueOnce([wbsDbRow()]);
      const kept = await updateWbsItemAction(base);
      expect(kept.ok).toBe(true);
      if (kept.ok) expect(kept.data.items.map((i) => i.id)).toEqual([7]);
      expect(execProc.mock.calls.map((c) => c[0])).toEqual([
        "usp_KeyDeliverable_Update",
        "usp_KeyDeliverable_GanttData",
      ]);
      expect(execProc.mock.calls[0]![1]).toMatchObject({
        KeyDeliverableId: 7,
        AssigneeIds: "[3]",
        Priority: "High",
        ColorSet: 0,
        BudgetSet: 0,
        RowVer: 10,
        ActorUserId: 7,
      });

      execProc.mockReset();
      execProc.mockResolvedValueOnce([{ ProjectId: 24 }]).mockResolvedValueOnce([wbsDbRow()]);
      await updateWbsItemAction({ ...base, color: "blue", budget: 1250.5 });
      expect(execProc.mock.calls[0]![1]).toMatchObject({
        Color: "blue",
        ColorSet: 1,
        Budget: 1250.5,
        BudgetSet: 1,
      });
      expect(revalidatePath).not.toHaveBeenCalled();
    });

    // Dependencies (ADR-0046): each sends exactly its own fields, with no spread from a form.
    it("links two items, forwarding the pair, the type and the lag", async () => {
      execProc
        .mockResolvedValueOnce([{ DependencyId: 3, ProjectId: 24 }])
        .mockResolvedValueOnce([wbsDbRow()]);
      const result = await linkWbsItemsAction({
        predecessorId: 7,
        successorId: 9,
        type: "SS",
        lagDays: 2,
      });
      expect(result.ok).toBe(true);
      const [proc, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
      expect(proc).toBe("usp_KeyDeliverableDependency_Link");
      expect(params).toEqual({
        PredecessorId: 7,
        SuccessorId: 9,
        DependencyType: "SS",
        LagDays: 2,
        ActorUserId: 7,
      });
    });

    it("defaults a link's lag to none", async () => {
      execProc
        .mockResolvedValueOnce([{ DependencyId: 3, ProjectId: 24 }])
        .mockResolvedValueOnce([wbsDbRow()]);
      await linkWbsItemsAction({ predecessorId: 7, successorId: 9, type: "FS" });
      const [, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
      expect(params).toMatchObject({ LagDays: 0 });
    });

    it("refuses a type the database would not allow", async () => {
      const result = await linkWbsItemsAction({
        predecessorId: 7,
        successorId: 9,
        type: "XX" as "FS",
      });
      expect(result.ok).toBe(false);
      expect(execProc).not.toHaveBeenCalled();
    });

    it("refuses a lag outside the bounds the CHECK constraint allows", async () => {
      const result = await linkWbsItemsAction({
        predecessorId: 7,
        successorId: 9,
        type: "FS",
        lagDays: 4000,
      });
      expect(result.ok).toBe(false);
      expect(execProc).not.toHaveBeenCalled();
    });

    it("retypes a link against its own rowVer", async () => {
      execProc.mockResolvedValueOnce([{ ProjectId: 24 }]).mockResolvedValueOnce([wbsDbRow()]);
      const result = await relinkWbsItemsAction({ id: 3, type: "FF", lagDays: -1, rowVer: 40 });
      expect(result.ok).toBe(true);
      const [proc, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
      expect(proc).toBe("usp_KeyDeliverableDependency_Relink");
      expect(params).toEqual({
        DependencyId: 3,
        DependencyType: "FF",
        LagDays: -1,
        RowVer: 40,
        ActorUserId: 7,
      });
    });

    it("unlinks against the link's rowVer, sending nothing else", async () => {
      execProc.mockResolvedValueOnce([{ ProjectId: 24 }]).mockResolvedValueOnce([wbsDbRow()]);
      const result = await unlinkWbsItemsAction({ id: 3, rowVer: 40 });
      expect(result.ok).toBe(true);
      const [proc, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
      expect(proc).toBe("usp_KeyDeliverableDependency_Unlink");
      expect(params).toEqual({ DependencyId: 3, RowVer: 40, ActorUserId: 7 });
    });

    // Milestones (ADR-0046): the flag has its own action, and travels on nothing else.
    it("turns an item into a milestone and back, forwarding only the flag and the rowVer", async () => {
      for (const isMilestone of [true, false]) {
        execProc.mockReset();
        execProc.mockResolvedValueOnce([{ ProjectId: 24 }]).mockResolvedValueOnce([wbsDbRow()]);
        const result = await setWbsMilestoneAction({ id: 7, isMilestone, rowVer: 10 });
        expect(result.ok).toBe(true);
        const [proc, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
        expect(proc).toBe("usp_KeyDeliverable_SetMilestone");
        expect(params).toEqual({
          KeyDeliverableId: 7,
          IsMilestone: isMilestone,
          RowVer: 10,
          ActorUserId: 7,
        });
      }
    });

    it("adds a milestone as one day, and refuses one asked for with a span", async () => {
      execProc
        .mockResolvedValueOnce([{ ...dbRow({ KeyDeliverableId: 9 }), HasChildren: false }])
        .mockResolvedValueOnce([wbsDbRow({ KeyDeliverableId: 9 })]);
      const ok = await addWbsItemAction({
        projectId: 24,
        name: "Design freeze",
        parentId: null,
        afterId: null,
        start: "2026-11-12",
        end: "2026-11-12",
        isMilestone: true,
      });
      expect(ok.ok).toBe(true);
      expect((execProc.mock.calls[0] as [string, Record<string, unknown>])[1]).toMatchObject({
        IsMilestone: true,
      });

      execProc.mockReset();
      const spanned = await addWbsItemAction({
        projectId: 24,
        name: "Design freeze",
        parentId: null,
        afterId: null,
        start: "2026-11-12",
        end: "2026-11-19",
        isMilestone: true,
      });
      expect(spanned.ok).toBe(false);
      if (!spanned.ok) expect(spanned.error.code).toBe("VALIDATION");
      expect(execProc).not.toHaveBeenCalled();
    });

    it("creates an ordinary item as a task, so nothing becomes a milestone by omission", async () => {
      execProc
        .mockResolvedValueOnce([{ ...dbRow({ KeyDeliverableId: 9 }), HasChildren: false }])
        .mockResolvedValueOnce([wbsDbRow({ KeyDeliverableId: 9 })]);
      await addWbsItemAction({
        projectId: 24,
        name: "Walls",
        parentId: null,
        afterId: null,
        start: "2026-04-16",
        end: "2026-04-22",
      });
      expect((execProc.mock.calls[0] as [string, Record<string, unknown>])[1]).toMatchObject({
        IsMilestone: false,
      });
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
