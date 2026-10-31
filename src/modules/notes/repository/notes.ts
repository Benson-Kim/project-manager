import { execProc } from "@/lib/db";
import { DEFAULT_PAGE_SIZE, toProcListParams, type ListParams } from "@/lib/list-params";
import { messages } from "@/lib/messages";
import { htmlToPlainText, sanitizeRichText } from "@/lib/rich-text/sanitize";
import {
  noteListRowSchema,
  noteRowSchema,
  noteSectionCreatedSchema,
  noteSectionRowSchema,
  noteTabRowSchema,
  type CreateNoteSectionValues,
  type CreateNoteTabValues,
  type CreateNoteValues,
  type MoveNoteTabValues,
  type NoteListRow,
  type NoteRow,
  type NoteSectionRow,
  type NoteTabRow,
  type NoteWorkspace,
  type ReorderNoteTabsValues,
  type UpdateNoteSectionValues,
  type UpdateNoteTabValues,
  type UpdateNoteValues,
} from "../schemas/note";

/**
 * Notes repository — stored procedures only, zod row parsing (STANDARDS §2.5).
 * Page HTML is sanitised again here and its plain text stored as SearchText,
 * which is what the list searches (ADR-0035). A notebook without a project lives
 * in the shared space every user may read and edit (migration 039).
 */

interface WorkspaceRow extends NoteRow {
  TabsJson: string | null;
  SectionsJson: string | null;
}

/** FOR JSON writes DATETIME2 without a zone; the columns are UTC. */
const utc = (v: unknown) => (typeof v === "string" && !/(Z|[+-]\d\d:\d\d)$/.test(v) ? `${v}Z` : v);

/** Every page read leaves sanitised, so legacy Access markup reaches the editor converted (ADR-0025). */
function toTab(raw: unknown): NoteTabRow {
  const tab = noteTabRowSchema.parse(raw);
  return { ...tab, Content: tab.Content ? sanitizeRichText(tab.Content) || null : null };
}

function parseSections(json: string | null): NoteSectionRow[] {
  if (!json) return [];
  return (JSON.parse(json) as unknown[]).map((s) => noteSectionRowSchema.parse(s));
}

function orderJson(order: { id: number; rowVer: number }[]): string {
  return JSON.stringify(order.map((o) => ({ id: o.id, rowVer: o.rowVer })));
}

function parseTabs(json: string | null): NoteTabRow[] {
  if (!json) return [];
  return (JSON.parse(json) as Record<string, unknown>[]).map((t) =>
    toTab({ ...t, CreatedAtUtc: utc(t.CreatedAtUtc), UpdatedAtUtc: utc(t.UpdatedAtUtc) }),
  );
}

export interface NoteListFilters {
  /** Only project-less notebooks (the /notes page's "No project" filter). */
  withoutProject?: boolean;
}

/** One project's notebooks, or with `projectId` null every notebook the actor may read. */
export async function listNotes(
  params: ListParams,
  actorUserId: number,
  projectId: number | null = null,
  pageSize: number = DEFAULT_PAGE_SIZE,
  filters: NoteListFilters = {},
): Promise<NoteListRow[]> {
  const rows = await execProc<NoteListRow>("usp_Note_List", {
    ActorUserId: actorUserId,
    ProjectId: projectId,
    ...toProcListParams(params, pageSize),
    WithoutProject: filters.withoutProject ?? false,
  });
  return rows.map((r) => noteListRowSchema.parse(r));
}

export async function getNoteById(noteId: number, actorUserId: number): Promise<NoteRow> {
  const rows = await execProc<NoteRow>("usp_Note_GetById", {
    NoteId: noteId,
    ActorUserId: actorUserId,
  });
  return noteRowSchema.parse(rows[0]);
}

export async function getNoteWorkspace(
  noteId: number,
  actorUserId: number,
): Promise<NoteWorkspace> {
  const rows = await execProc<WorkspaceRow>("usp_Note_GetWithTabs", {
    NoteId: noteId,
    ActorUserId: actorUserId,
  });
  const row = rows[0];
  return {
    note: noteRowSchema.parse(row),
    tabs: parseTabs(row?.TabsJson ?? null),
    sections: parseSections(row?.SectionsJson ?? null),
  };
}

export async function createNote(input: CreateNoteValues, actorUserId: number): Promise<NoteRow> {
  const rows = await execProc<NoteRow>("usp_Note_Create", {
    ProjectId: input.projectId,
    Title: input.title,
    FirstTabTitle: messages.notes.firstPageTitle,
    ActorUserId: actorUserId,
  });
  return noteRowSchema.parse(rows[0]);
}

export async function updateNote(input: UpdateNoteValues, actorUserId: number): Promise<NoteRow> {
  const rows = await execProc<NoteRow>("usp_Note_Update", {
    NoteId: input.noteId,
    Title: input.title,
    RowVer: input.rowVer,
    ActorUserId: actorUserId,
  });
  return noteRowSchema.parse(rows[0]);
}

export async function deleteNote(
  noteId: number,
  rowVer: number,
  actorUserId: number,
): Promise<void> {
  await execProc("usp_Note_Delete", { NoteId: noteId, RowVer: rowVer, ActorUserId: actorUserId });
}

export async function createNoteTab(
  input: CreateNoteTabValues,
  actorUserId: number,
): Promise<NoteTabRow> {
  const rows = await execProc<NoteTabRow>("usp_NoteTab_Create", {
    NoteId: input.noteId,
    Title: input.title,
    NoteSectionId: input.sectionId,
    ActorUserId: actorUserId,
  });
  return toTab(rows[0]);
}

export async function updateNoteTab(
  input: UpdateNoteTabValues,
  actorUserId: number,
): Promise<NoteTabRow> {
  const content = input.content ? sanitizeRichText(input.content) || null : null;
  const rows = await execProc<NoteTabRow>("usp_NoteTab_Update", {
    NoteTabId: input.noteTabId,
    Title: input.title,
    Content: content,
    SearchText: content ? htmlToPlainText(content) || null : null,
    RowVer: input.rowVer,
    ActorUserId: actorUserId,
  });
  return toTab(rows[0]);
}

export async function deleteNoteTab(
  noteTabId: number,
  rowVer: number,
  actorUserId: number,
): Promise<void> {
  await execProc("usp_NoteTab_Delete", {
    NoteTabId: noteTabId,
    RowVer: rowVer,
    ActorUserId: actorUserId,
  });
}

export async function reorderNoteTabs(
  input: ReorderNoteTabsValues,
  actorUserId: number,
): Promise<NoteTabRow[]> {
  const rows = await execProc<NoteTabRow>("usp_NoteTab_Reorder", {
    NoteId: input.noteId,
    OrderJson: orderJson(input.order),
    ActorUserId: actorUserId,
  });
  return rows.map(toTab);
}

export async function moveNoteTab(
  input: MoveNoteTabValues,
  actorUserId: number,
): Promise<NoteTabRow> {
  const rows = await execProc<NoteTabRow>("usp_NoteTab_Move", {
    NoteTabId: input.noteTabId,
    NoteSectionId: input.sectionId,
    RowVer: input.rowVer,
    ActorUserId: actorUserId,
  });
  return toTab(rows[0]);
}

/** The note's first tab takes every page it already has; a later tab starts with one new page. */
export async function createNoteSection(
  input: CreateNoteSectionValues,
  actorUserId: number,
): Promise<NoteSectionRow & { FirstPageId: number }> {
  const rows = await execProc<unknown>("usp_NoteSection_Create", {
    NoteId: input.noteId,
    Title: input.title,
    PageTitle: input.pageTitle,
    ActorUserId: actorUserId,
  });
  return noteSectionCreatedSchema.parse(rows[0]);
}

export async function updateNoteSection(
  input: UpdateNoteSectionValues,
  actorUserId: number,
): Promise<NoteSectionRow> {
  const rows = await execProc<unknown>("usp_NoteSection_Update", {
    NoteSectionId: input.sectionId,
    Title: input.title,
    RowVer: input.rowVer,
    ActorUserId: actorUserId,
  });
  return noteSectionRowSchema.parse(rows[0]);
}

export async function deleteNoteSection(
  sectionId: number,
  rowVer: number,
  actorUserId: number,
): Promise<void> {
  await execProc("usp_NoteSection_Delete", {
    NoteSectionId: sectionId,
    RowVer: rowVer,
    ActorUserId: actorUserId,
  });
}

export async function reorderNoteSections(
  input: ReorderNoteTabsValues,
  actorUserId: number,
): Promise<NoteSectionRow[]> {
  const rows = await execProc<unknown>("usp_NoteSection_Reorder", {
    NoteId: input.noteId,
    OrderJson: orderJson(input.order),
    ActorUserId: actorUserId,
  });
  return rows.map((r) => noteSectionRowSchema.parse(r));
}

/** Removes every tab and keeps every page, in the order the tabs showed them. */
export async function ungroupNoteSections(
  input: ReorderNoteTabsValues,
  actorUserId: number,
): Promise<void> {
  await execProc("usp_NoteSection_Ungroup", {
    NoteId: input.noteId,
    OrderJson: orderJson(input.order),
    ActorUserId: actorUserId,
  });
}
