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
  createNoteAction,
  createNoteSectionAction,
  createNoteTabAction,
  deleteNoteAction,
  deleteNoteSectionAction,
  deleteNoteTabAction,
  moveNoteTabAction,
  reorderNoteSectionsAction,
  reorderNoteTabsAction,
  ungroupNoteSectionsAction,
  updateNoteAction,
  updateNoteSectionAction,
  updateNoteTabAction,
} from "../actions";

function noteRow(overrides: Record<string, unknown> = {}) {
  return {
    NoteId: 4,
    ProjectId: 2,
    Title: "Kickoff notes",
    CreatedAtUtc: new Date("2026-01-01T00:00:00Z"),
    UpdatedAtUtc: null,
    RowVer: "42",
    ...overrides,
  };
}

function tabRow(overrides: Record<string, unknown> = {}) {
  return {
    NoteTabId: 9,
    NoteId: 4,
    NoteSectionId: null,
    ProjectId: 2,
    Title: "Page one",
    Content: null,
    SortOrder: 1,
    CreatedAtUtc: new Date("2026-01-01T00:00:00Z"),
    UpdatedAtUtc: null,
    RowVer: "7",
    ...overrides,
  };
}

function sectionRow(overrides: Record<string, unknown> = {}) {
  return { NoteSectionId: 3, NoteId: 4, Title: "Design", SortOrder: 1, RowVer: "5", ...overrides };
}

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

describe("notes actions", () => {
  beforeEach(() => {
    session = { userId: 7, username: "pm", role: "User" };
    execProc.mockReset();
    revalidatePath.mockClear();
  });

  it("create succeeds from FormData and calls the repository", async () => {
    execProc.mockResolvedValue([noteRow()]);
    const result = await createNoteAction(form({ projectId: "2", title: "Kickoff notes" }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.NoteId).toBe(4);
    const [proc, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(proc).toBe("usp_Note_Create");
    expect(params.ProjectId).toBe(2);
    expect(params.Title).toBe("Kickoff notes");
    expect(params.ActorUserId).toBe(7);
  });

  it("create without a project id sends NULL: the project-less shared space", async () => {
    execProc.mockResolvedValue([noteRow({ ProjectId: null })]);
    const result = await createNoteAction(form({ title: "Shared notebook" }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.ProjectId).toBeNull();
    const [proc, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(proc).toBe("usp_Note_Create");
    expect(params.ProjectId).toBeNull();
  });

  it("create returns VALIDATION with fieldErrors for an empty title", async () => {
    const result = await createNoteAction(form({ projectId: "2", title: "   " }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION");
      expect(result.error.fieldErrors?.title).toBeDefined();
    }
    expect(execProc).not.toHaveBeenCalled();
  });

  it("create is refused without a session", async () => {
    session = null;
    const result = await createNoteAction(form({ projectId: "2", title: "x" }));
    expect(result.ok).toBe(false);
    expect(execProc).not.toHaveBeenCalled();
  });

  it("create surfaces the proc's FORBIDDEN_ROW", async () => {
    execProc.mockRejectedValue(new AppError("FORBIDDEN_ROW", "Your access does not allow this"));
    const result = await createNoteAction(form({ projectId: "2", title: "x" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN_ROW");
  });

  it("update forwards the rename with rowVer", async () => {
    execProc.mockResolvedValue([noteRow({ Title: "Renamed" })]);
    const result = await updateNoteAction(form({ noteId: "4", title: "Renamed", rowVer: "42" }));
    expect(result.ok).toBe(true);
    expect(execProc).toHaveBeenCalledWith("usp_Note_Update", {
      NoteId: 4,
      Title: "Renamed",
      RowVer: 42,
      ActorUserId: 7,
    });
  });

  it("update maps a rowversion mismatch to CONFLICT", async () => {
    execProc.mockRejectedValue(new AppError("CONFLICT", "Note was modified by someone else"));
    const result = await updateNoteAction(form({ noteId: "4", title: "Renamed", rowVer: "1" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONFLICT");
  });

  it("delete returns the note id and forwards ids to the proc", async () => {
    execProc.mockResolvedValue([]);
    const result = await deleteNoteAction({ noteId: 4, rowVer: 42 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual({ noteId: 4 });
    expect(execProc).toHaveBeenCalledWith("usp_Note_Delete", {
      NoteId: 4,
      RowVer: 42,
      ActorUserId: 7,
    });
  });

  it("delete propagates NOT_FOUND", async () => {
    execProc.mockRejectedValue(new AppError("NOT_FOUND", "Note not found"));
    const result = await deleteNoteAction({ noteId: 999, rowVer: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
  });

  it("createNoteTab succeeds", async () => {
    execProc.mockResolvedValue([tabRow()]);
    const result = await createNoteTabAction(form({ noteId: "4", title: "Page one" }));
    expect(result.ok).toBe(true);
    expect(execProc.mock.calls[0][0]).toBe("usp_NoteTab_Create");
  });

  it("createNoteTab rejects an empty title", async () => {
    const result = await createNoteTabAction(form({ noteId: "4", title: "" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION");
    expect(execProc).not.toHaveBeenCalled();
  });

  it("updateNoteTab sanitises content before it reaches the proc", async () => {
    execProc.mockResolvedValue([tabRow()]);
    const result = await updateNoteTabAction(
      form({
        noteTabId: "9",
        title: "Page one",
        content: "<p>Hi</p><script>alert(1)</script>",
        rowVer: "7",
      }),
    );
    expect(result.ok).toBe(true);
    const [proc, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(proc).toBe("usp_NoteTab_Update");
    expect(String(params.Content)).not.toContain("<script");
    expect(params.SearchText).toBe("Hi");
  });

  it("updateNoteTab accepts empty content as null", async () => {
    execProc.mockResolvedValue([tabRow()]);
    const result = await updateNoteTabAction(
      form({ noteTabId: "9", title: "Page one", content: "", rowVer: "7" }),
    );
    expect(result.ok).toBe(true);
    const [, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(params.Content).toBeNull();
  });

  it("deleteNoteTab returns the page id", async () => {
    execProc.mockResolvedValue([]);
    const result = await deleteNoteTabAction({ noteTabId: 9, rowVer: 7 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual({ noteTabId: 9 });
    expect(execProc).toHaveBeenCalledWith("usp_NoteTab_Delete", {
      NoteTabId: 9,
      RowVer: 7,
      ActorUserId: 7,
    });
  });

  it("reorder forwards the order as JSON", async () => {
    execProc.mockResolvedValue([tabRow(), tabRow({ NoteTabId: 10, SortOrder: 2 })]);
    const result = await reorderNoteTabsAction({
      noteId: 4,
      order: [
        { id: 10, rowVer: 8 },
        { id: 9, rowVer: 7 },
      ],
    });
    expect(result.ok).toBe(true);
    const [proc, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(proc).toBe("usp_NoteTab_Reorder");
    expect(JSON.parse(params.OrderJson as string)).toHaveLength(2);
  });

  it("createNoteTab passes the tab it names", async () => {
    execProc.mockResolvedValue([tabRow({ NoteSectionId: 3 })]);
    const result = await createNoteTabAction({ noteId: 4, title: "Page two", sectionId: 3 });
    expect(result.ok).toBe(true);
    expect((execProc.mock.calls[0] as [string, Record<string, unknown>])[1].NoteSectionId).toBe(3);
  });

  it("moveNoteTab moves a page to another tab", async () => {
    execProc.mockResolvedValue([tabRow({ NoteSectionId: 6 })]);
    const result = await moveNoteTabAction({ noteTabId: 9, sectionId: 6, rowVer: 7 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.NoteSectionId).toBe(6);
    expect(execProc).toHaveBeenCalledWith("usp_NoteTab_Move", {
      NoteTabId: 9,
      NoteSectionId: 6,
      RowVer: 7,
      ActorUserId: 7,
    });
  });

  it("moveNoteTab surfaces the proc's refusal of a tab's last page", async () => {
    execProc.mockRejectedValue(new AppError("VALIDATION", "A tab keeps at least one page"));
    const result = await moveNoteTabAction({ noteTabId: 9, sectionId: 6, rowVer: 7 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION");
  });

  it("createNoteSection returns the tab and its first page", async () => {
    execProc.mockResolvedValue([sectionRow({ FirstPageId: 9 })]);
    const result = await createNoteSectionAction({
      noteId: 4,
      title: "Design",
      pageTitle: "Page 1",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toMatchObject({ NoteSectionId: 3, FirstPageId: 9 });
    expect(execProc.mock.calls[0][0]).toBe("usp_NoteSection_Create");
  });

  it("createNoteSection rejects an empty title without calling the database", async () => {
    const result = await createNoteSectionAction({ noteId: 4, title: " ", pageTitle: "Page 1" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION");
    expect(execProc).not.toHaveBeenCalled();
  });

  it("updateNoteSection renames a tab and maps a stale RowVer to CONFLICT", async () => {
    execProc.mockResolvedValue([sectionRow({ Title: "Build" })]);
    const renamed = await updateNoteSectionAction(
      form({ sectionId: "3", title: "Build", rowVer: "5" }),
    );
    expect(renamed.ok).toBe(true);
    execProc.mockRejectedValue(
      new AppError("CONFLICT", "NoteSection was modified by someone else"),
    );
    const stale = await updateNoteSectionAction({ sectionId: 3, title: "Build", rowVer: 1 });
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.error.code).toBe("CONFLICT");
  });

  it("deleteNoteSection returns the tab id", async () => {
    execProc.mockResolvedValue([]);
    const result = await deleteNoteSectionAction({ sectionId: 3, rowVer: 5 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual({ sectionId: 3 });
    expect(execProc).toHaveBeenCalledWith("usp_NoteSection_Delete", {
      NoteSectionId: 3,
      RowVer: 5,
      ActorUserId: 7,
    });
  });

  it("reorderNoteSections and ungroupNoteSections send the tab order as JSON", async () => {
    const order = [
      { id: 6, rowVer: 8 },
      { id: 3, rowVer: 5 },
    ];
    execProc.mockResolvedValue([sectionRow({ NoteSectionId: 6 }), sectionRow()]);
    expect((await reorderNoteSectionsAction({ noteId: 4, order })).ok).toBe(true);
    expect(execProc.mock.calls[0][0]).toBe("usp_NoteSection_Reorder");
    execProc.mockReset();
    execProc.mockResolvedValue([]);
    const removed = await ungroupNoteSectionsAction({ noteId: 4, order });
    expect(removed.ok).toBe(true);
    if (removed.ok) expect(removed.data).toEqual({ noteId: 4 });
    const [proc, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(proc).toBe("usp_NoteSection_Ungroup");
    expect(JSON.parse(params.OrderJson as string)).toEqual(order);
  });

  it("ungroupNoteSections needs at least one tab", async () => {
    const result = await ungroupNoteSectionsAction({ noteId: 4, order: [] });
    expect(result.ok).toBe(false);
    expect(execProc).not.toHaveBeenCalled();
  });

  it("reorder rejects duplicate ids without calling the database", async () => {
    const result = await reorderNoteTabsAction({
      noteId: 4,
      order: [
        { id: 9, rowVer: 7 },
        { id: 9, rowVer: 7 },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION");
    expect(execProc).not.toHaveBeenCalled();
  });
});
