import { beforeEach, describe, expect, it, vi } from "vitest";

const execProc = vi.fn();
vi.mock("@/lib/db", () => ({
  execProc: (...args: unknown[]) => execProc(...args) as Promise<unknown[]>,
}));

import { listParamsSchema } from "@/lib/list-params";
import { messages } from "@/lib/messages";
import {
  createNote,
  createNoteSection,
  createNoteTab,
  deleteNoteSection,
  deleteNote,
  deleteNoteTab,
  getNoteById,
  getNoteWorkspace,
  moveNoteTab,
  reorderNoteSections,
  ungroupNoteSections,
  updateNoteSection,
  listNotes,
  reorderNoteTabs,
  updateNote,
  updateNoteTab,
} from "../repository/notes";

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
    Content: "<p>Hello</p>",
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

function lastCall() {
  return execProc.mock.calls[0] as [string, Record<string, unknown>];
}

describe("notes repository", () => {
  beforeEach(() => execProc.mockReset());

  it("list forwards ADR-0016 params with project scope", async () => {
    execProc.mockResolvedValue([
      noteRow({
        ProjectName: "Apollo",
        TabCount: 3,
        LastEditedAtUtc: new Date("2026-01-02T00:00:00Z"),
        TotalCount: 5,
        ActorAccess: "Manager",
      }),
    ]);
    const rows = await listNotes(listParamsSchema.parse({ page: "2" }), 1, 2);
    expect(rows[0].TotalCount).toBe(5);
    expect(rows[0].TabCount).toBe(3);
    expect(execProc).toHaveBeenCalledWith("usp_Note_List", {
      ActorUserId: 1,
      ProjectId: 2,
      Search: null,
      SortBy: null,
      SortDir: "asc",
      Page: 2,
      PageSize: 25,
      WithoutProject: false,
    });
  });

  it("list across projects forwards the No project filter and parses project-less rows", async () => {
    execProc.mockResolvedValue([
      noteRow({
        ProjectId: null,
        ProjectName: null,
        TabCount: 1,
        LastEditedAtUtc: new Date("2026-01-02T00:00:00Z"),
        TotalCount: 1,
        ActorAccess: "Contributor",
      }),
    ]);
    const rows = await listNotes(listParamsSchema.parse({}), 1, null, undefined, {
      withoutProject: true,
    });
    expect(rows[0]).toMatchObject({ ProjectId: null, ProjectName: null });
    const [, params] = lastCall();
    expect(params).toMatchObject({ ProjectId: null, WithoutProject: true });
  });

  it("list rejects contract-breaking rows", async () => {
    execProc.mockResolvedValue([
      noteRow({ TabCount: 1, TotalCount: 1, ActorAccess: "Manager", NoteId: "x" }),
    ]);
    await expect(listNotes(listParamsSchema.parse({}), 1)).rejects.toThrow();
  });

  it("getById forwards ids and parses the row", async () => {
    execProc.mockResolvedValue([noteRow()]);
    const row = await getNoteById(4, 1);
    expect(row).toMatchObject({ NoteId: 4, Title: "Kickoff notes", RowVer: 42 });
    expect(execProc).toHaveBeenCalledWith("usp_Note_GetById", { NoteId: 4, ActorUserId: 1 });
  });

  it("workspace parses TabsJson into typed pages", async () => {
    const tabs = [
      tabRow({
        CreatedAtUtc: "2026-01-01T00:00:00.000Z",
        UpdatedAtUtc: "2026-01-03T00:00:00.000Z",
      }),
      tabRow({
        NoteTabId: 10,
        Title: "Page two",
        Content: null,
        SortOrder: 2,
        RowVer: "8",
        CreatedAtUtc: "2026-01-01T00:00:00.000Z",
      }),
    ];
    execProc.mockResolvedValue([noteRow({ TabsJson: JSON.stringify(tabs) })]);
    const { note, tabs: parsed } = await getNoteWorkspace(4, 1);
    expect(execProc).toHaveBeenCalledWith("usp_Note_GetWithTabs", { NoteId: 4, ActorUserId: 1 });
    expect(note.NoteId).toBe(4);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].CreatedAtUtc).toBeInstanceOf(Date);
    expect(parsed[0].UpdatedAtUtc).toBeInstanceOf(Date);
    expect(parsed[0].RowVer).toBe(7);
    expect(parsed[1]).toMatchObject({ NoteTabId: 10, Content: null, SortOrder: 2 });
  });

  it("workspace sanitises stored page HTML and converts legacy Access markup", async () => {
    const tabs = [
      tabRow({
        Content: '<div><font face="Arial" size="4">Old</font><script>alert(1)</script></div>',
        CreatedAtUtc: "2026-01-01T00:00:00.000Z",
      }),
    ];
    execProc.mockResolvedValue([noteRow({ TabsJson: JSON.stringify(tabs) })]);
    const { tabs: parsed } = await getNoteWorkspace(4, 1);
    expect(parsed[0].Content).toContain("font-family");
    expect(parsed[0].Content).not.toContain("<font");
    expect(parsed[0].Content).not.toContain("script");
  });

  it("workspace returns no pages when TabsJson is null", async () => {
    execProc.mockResolvedValue([noteRow({ TabsJson: null })]);
    const { tabs } = await getNoteWorkspace(4, 1);
    expect(tabs).toEqual([]);
  });

  it("create forwards the title and the first page title", async () => {
    execProc.mockResolvedValue([noteRow()]);
    const row = await createNote({ projectId: 2, title: "Kickoff notes" }, 7);
    expect(row.NoteId).toBe(4);
    expect(execProc).toHaveBeenCalledWith("usp_Note_Create", {
      ProjectId: 2,
      Title: "Kickoff notes",
      FirstTabTitle: messages.notes.firstPageTitle,
      ActorUserId: 7,
    });
  });

  it("create without a project sends NULL for the shared space", async () => {
    execProc.mockResolvedValue([noteRow({ ProjectId: null })]);
    const row = await createNote({ projectId: null, title: "Shared" }, 7);
    expect(row.ProjectId).toBeNull();
    const [, params] = lastCall();
    expect(params.ProjectId).toBeNull();
  });

  it("update carries rowVer for optimistic concurrency", async () => {
    execProc.mockResolvedValue([noteRow({ Title: "Renamed" })]);
    await updateNote({ noteId: 4, title: "Renamed", rowVer: 42 }, 1);
    expect(execProc).toHaveBeenCalledWith("usp_Note_Update", {
      NoteId: 4,
      Title: "Renamed",
      RowVer: 42,
      ActorUserId: 1,
    });
  });

  it("delete forwards ids and rowVer", async () => {
    execProc.mockResolvedValue([]);
    await deleteNote(4, 42, 1);
    expect(execProc).toHaveBeenCalledWith("usp_Note_Delete", {
      NoteId: 4,
      RowVer: 42,
      ActorUserId: 1,
    });
  });

  it("createNoteTab forwards the note and title", async () => {
    execProc.mockResolvedValue([tabRow()]);
    const row = await createNoteTab({ noteId: 4, title: "Page one", sectionId: null }, 7);
    expect(row.NoteTabId).toBe(9);
    expect(execProc).toHaveBeenCalledWith("usp_NoteTab_Create", {
      NoteId: 4,
      Title: "Page one",
      NoteSectionId: null,
      ActorUserId: 7,
    });
  });

  it("createNoteTab adds the page to the tab it names", async () => {
    execProc.mockResolvedValue([tabRow({ NoteSectionId: 3 })]);
    const row = await createNoteTab({ noteId: 4, title: "Page one", sectionId: 3 }, 7);
    expect(row.NoteSectionId).toBe(3);
    expect(lastCall()[1].NoteSectionId).toBe(3);
  });

  it("workspace parses SectionsJson into tabs, and none when it is null", async () => {
    execProc.mockResolvedValue([
      noteRow({
        TabsJson: JSON.stringify([tabRow({ NoteSectionId: 3 })]),
        SectionsJson: JSON.stringify([
          sectionRow(),
          sectionRow({ NoteSectionId: 6, SortOrder: 2 }),
        ]),
      }),
    ]);
    const { sections, tabs } = await getNoteWorkspace(4, 1);
    expect(sections.map((s) => s.NoteSectionId)).toEqual([3, 6]);
    expect(sections[0].RowVer).toBe(5);
    expect(tabs[0].NoteSectionId).toBe(3);
    execProc.mockResolvedValue([noteRow({ TabsJson: null, SectionsJson: null })]);
    expect((await getNoteWorkspace(4, 1)).sections).toEqual([]);
  });

  it("moveNoteTab forwards the page, the tab and its RowVer", async () => {
    execProc.mockResolvedValue([tabRow({ NoteSectionId: 6 })]);
    const row = await moveNoteTab({ noteTabId: 9, sectionId: 6, rowVer: 7 }, 1);
    expect(row.NoteSectionId).toBe(6);
    expect(execProc).toHaveBeenCalledWith("usp_NoteTab_Move", {
      NoteTabId: 9,
      NoteSectionId: 6,
      RowVer: 7,
      ActorUserId: 1,
    });
  });

  it("createNoteSection returns the tab and the page it opens on", async () => {
    execProc.mockResolvedValue([sectionRow({ FirstPageId: 9 })]);
    const row = await createNoteSection({ noteId: 4, title: "Design", pageTitle: "Page 1" }, 1);
    expect(row).toMatchObject({ NoteSectionId: 3, FirstPageId: 9, RowVer: 5 });
    expect(execProc).toHaveBeenCalledWith("usp_NoteSection_Create", {
      NoteId: 4,
      Title: "Design",
      PageTitle: "Page 1",
      ActorUserId: 1,
    });
  });

  it("createNoteSection rejects a row without its first page", async () => {
    execProc.mockResolvedValue([sectionRow()]);
    await expect(
      createNoteSection({ noteId: 4, title: "Design", pageTitle: "Page 1" }, 1),
    ).rejects.toThrow();
  });

  it("update, delete, reorder and remove of tabs forward their ids and RowVers", async () => {
    execProc.mockResolvedValue([sectionRow({ Title: "Build" })]);
    expect((await updateNoteSection({ sectionId: 3, title: "Build", rowVer: 5 }, 1)).Title).toBe(
      "Build",
    );
    expect(lastCall()).toEqual([
      "usp_NoteSection_Update",
      { NoteSectionId: 3, Title: "Build", RowVer: 5, ActorUserId: 1 },
    ]);

    execProc.mockReset();
    execProc.mockResolvedValue([]);
    await deleteNoteSection(3, 5, 1);
    expect(lastCall()).toEqual([
      "usp_NoteSection_Delete",
      { NoteSectionId: 3, RowVer: 5, ActorUserId: 1 },
    ]);

    execProc.mockReset();
    execProc.mockResolvedValue([sectionRow({ NoteSectionId: 6 }), sectionRow({ SortOrder: 2 })]);
    const order = [
      { id: 6, rowVer: 8 },
      { id: 3, rowVer: 5 },
    ];
    const rows = await reorderNoteSections({ noteId: 4, order }, 1);
    expect(rows.map((r) => r.NoteSectionId)).toEqual([6, 3]);
    expect(lastCall()[0]).toBe("usp_NoteSection_Reorder");
    expect(JSON.parse(lastCall()[1].OrderJson as string)).toEqual(order);

    execProc.mockReset();
    execProc.mockResolvedValue([]);
    await ungroupNoteSections({ noteId: 4, order }, 1);
    expect(lastCall()[0]).toBe("usp_NoteSection_Ungroup");
    expect(JSON.parse(lastCall()[1].OrderJson as string)).toEqual(order);
  });

  it("updateNoteTab sanitises the content and stores its plain text for search", async () => {
    execProc.mockResolvedValue([tabRow()]);
    await updateNoteTab(
      {
        noteTabId: 9,
        title: "Page one",
        content: "<p>Hello <strong>world</strong></p><script>alert(1)</script>",
        rowVer: 7,
      },
      1,
    );
    const [proc, params] = lastCall();
    expect(proc).toBe("usp_NoteTab_Update");
    expect(params.NoteTabId).toBe(9);
    expect(params.Title).toBe("Page one");
    expect(params.RowVer).toBe(7);
    expect(params.ActorUserId).toBe(1);
    expect(String(params.Content)).toContain("<strong>world</strong>");
    expect(String(params.Content)).not.toContain("<script");
    expect(String(params.SearchText)).toContain("Hello world");
    expect(String(params.SearchText)).not.toContain("<");
    expect(String(params.SearchText)).not.toContain("alert");
  });

  it("updateNoteTab sends null content and search text when empty", async () => {
    execProc.mockResolvedValue([tabRow({ Content: null })]);
    await updateNoteTab({ noteTabId: 9, title: "Page one", content: null, rowVer: 7 }, 1);
    const [, params] = lastCall();
    expect(params.Content).toBeNull();
    expect(params.SearchText).toBeNull();
  });

  it("deleteNoteTab forwards ids and rowVer", async () => {
    execProc.mockResolvedValue([]);
    await deleteNoteTab(9, 7, 1);
    expect(execProc).toHaveBeenCalledWith("usp_NoteTab_Delete", {
      NoteTabId: 9,
      RowVer: 7,
      ActorUserId: 1,
    });
  });

  it("reorder sends the order as JSON and parses the returned pages", async () => {
    execProc.mockResolvedValue([tabRow({ SortOrder: 1 }), tabRow({ NoteTabId: 10, SortOrder: 2 })]);
    const order = [
      { id: 10, rowVer: 8 },
      { id: 9, rowVer: 7 },
    ];
    const rows = await reorderNoteTabs({ noteId: 4, order }, 1);
    expect(rows).toHaveLength(2);
    const [proc, params] = lastCall();
    expect(proc).toBe("usp_NoteTab_Reorder");
    expect(params.NoteId).toBe(4);
    expect(params.ActorUserId).toBe(1);
    expect(JSON.parse(params.OrderJson as string)).toEqual(order);
  });
});
