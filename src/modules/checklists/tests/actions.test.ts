import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/lib/auth/types";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));

const session: Session = { userId: 7, username: "pm", role: "User" };
vi.mock("@/lib/auth/provider", () => ({
  auth: {
    getSession: () => Promise.resolve(session),
    requireSession: () => Promise.resolve(session),
  },
}));

const execProc = vi.fn();
vi.mock("@/lib/db", () => ({
  execProc: (...args: unknown[]) => execProc(...args) as Promise<unknown[]>,
}));

import {
  createColumnAction,
  moveColumnAction,
  runTodoAction,
  setCellAction,
  setItemDoneAction,
} from "../actions";

function itemRow(overrides: Record<string, unknown> = {}) {
  return {
    ChecklistItemId: 21,
    ChecklistId: 4,
    ProjectId: 3,
    Title: "Sign the contract",
    IsDone: false,
    DoneAtUtc: null,
    DoneByName: null,
    SortOrder: 1,
    CreatedAtUtc: new Date("2026-11-12T08:00:00Z"),
    RowVer: "90",
    ActorAccess: "Contributor",
    ActorGrants: null,
    ActorRevokes: null,
    Cells: JSON.stringify([{ columnId: 5, date: "2026-12-01" }]),
    ...overrides,
  };
}

const column = {
  ChecklistColumnId: 5,
  ChecklistId: 4,
  Name: "Due",
  Kind: "date",
  ActionKind: null,
  SortOrder: 1,
  RowVer: "11",
};

beforeEach(() => execProc.mockReset());

describe("checklist actions (ADR-0066)", () => {
  it("a cell write sends the tidied value with the row's version and reads the cells back", async () => {
    execProc.mockResolvedValue([
      itemRow({ Cells: JSON.stringify([{ columnId: 6, link: "https://example.com/a" }]) }),
    ]);
    const result = await setCellAction({
      itemId: 21,
      columnId: 6,
      kind: "document",
      value: " example.com/a ",
      rowVer: 90,
    });
    expect(execProc).toHaveBeenCalledWith("usp_ChecklistCell_Set", {
      ChecklistItemId: 21,
      ChecklistColumnId: 6,
      Value: "https://example.com/a",
      RowVer: 90,
      ActorUserId: 7,
    });
    expect(result.ok && result.data.Cells).toEqual([
      { columnId: 6, link: "https://example.com/a" },
    ]);
  });

  it("a blank cell is sent as NULL, which empties it", async () => {
    execProc.mockResolvedValue([itemRow({ Cells: null })]);
    await setCellAction({ itemId: 21, columnId: 5, kind: "date", value: "", rowVer: 90 });
    expect(execProc.mock.calls[0]![1]).toMatchObject({ Value: null });
  });

  it("a bad value never reaches the proc", async () => {
    for (const [kind, value] of [
      ["document", "javascript:alert(1)"],
      ["date", "2026-02-30"],
      ["action", "yes"],
    ] as const) {
      const result = await setCellAction({ itemId: 21, columnId: 5, kind, value, rowVer: 90 });
      expect(result.ok, `${kind} ${value}`).toBe(false);
    }
    expect(execProc).not.toHaveBeenCalled();
  });

  it("a column is added with its kind, and an action only on a button", async () => {
    execProc.mockResolvedValue([
      { ...column, Kind: "action", ActionKind: "todo", Name: "Follow up" },
    ]);
    const ok = await createColumnAction({
      checklistId: 4,
      name: " Follow up ",
      kind: "action",
      actionKind: "todo",
    });
    expect(ok.ok).toBe(true);
    expect(execProc).toHaveBeenCalledWith("usp_ChecklistColumn_Create", {
      ChecklistId: 4,
      Name: "Follow up",
      Kind: "action",
      ActionKind: "todo",
      ActorUserId: 7,
    });
    execProc.mockReset();
    const bad = await createColumnAction({
      checklistId: 4,
      name: "Due",
      kind: "date",
      actionKind: "todo",
    });
    expect(bad.ok).toBe(false);
    expect(execProc).not.toHaveBeenCalled();
  });

  it("a column moves one place at a time and answers with the new order", async () => {
    execProc.mockResolvedValue([
      column,
      { ...column, ChecklistColumnId: 6, Name: "Note", Kind: "text" },
    ]);
    const result = await moveColumnAction({ columnId: 6, direction: -1, rowVer: 12 });
    expect(result.ok && result.data.map((c) => c.Name)).toEqual(["Due", "Note"]);
    const bad = await moveColumnAction({ columnId: 6, direction: 2 as -1, rowVer: 12 });
    expect(bad.ok).toBe(false);
  });

  it("the done tick and the to-do button go to their procs", async () => {
    execProc.mockResolvedValue([
      itemRow({ IsDone: true, DoneAtUtc: "2026-11-12T09:00:00Z", DoneByName: "pm" }),
    ]);
    const done = await setItemDoneAction({ itemId: 21, done: true, rowVer: 90 });
    expect(done.ok && done.data.DoneByName).toBe("pm");
    expect(execProc).toHaveBeenLastCalledWith("usp_ChecklistItem_SetStatus", {
      ChecklistItemId: 21,
      IsDone: true,
      RowVer: 90,
      ActorUserId: 7,
    });
    execProc.mockResolvedValue([itemRow({ Cells: JSON.stringify([{ columnId: 9, todoId: 77 }]) })]);
    const todo = await runTodoAction({ itemId: 21, columnId: 9 });
    expect(todo.ok && todo.data.Cells[0]?.todoId).toBe(77);
    expect(execProc).toHaveBeenLastCalledWith("usp_Todo_BuildFromChecklist", {
      ChecklistItemId: 21,
      ChecklistColumnId: 9,
      ActorUserId: 7,
    });
  });
});
