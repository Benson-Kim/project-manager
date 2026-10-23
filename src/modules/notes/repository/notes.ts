import { execProc } from "@/lib/db";
import { DEFAULT_PAGE_SIZE, toProcListParams, type ListParams } from "@/lib/list-params";
import { messages } from "@/lib/messages";
import { htmlToPlainText, sanitizeRichText } from "@/lib/rich-text/sanitize";
import {
  noteListRowSchema,
  noteRowSchema,
  noteTabRowSchema,
  type CreateNoteTabValues,
  type CreateNoteValues,
  type NoteListRow,
  type NoteRow,
  type NoteTabRow,
  type NoteWorkspace,
  type ReorderNoteTabsValues,
  type UpdateNoteTabValues,
  type UpdateNoteValues,
} from "../schemas/note";

/**
 * Notes repository — stored procedures only, zod row parsing (STANDARDS §2.5).
 * Page HTML is sanitised again here and its plain text stored as SearchText,
 * which is what the list searches (ADR-0035).
 */

interface WorkspaceRow extends NoteRow {
  TabsJson: string | null;
}

/** FOR JSON writes DATETIME2 without a zone; the columns are UTC. */
const utc = (v: unknown) => (typeof v === "string" && !/(Z|[+-]\d\d:\d\d)$/.test(v) ? `${v}Z` : v);

/** Every page read leaves sanitised, so legacy Access markup reaches the editor converted (ADR-0025). */
function toTab(raw: unknown): NoteTabRow {
  const tab = noteTabRowSchema.parse(raw);
  return { ...tab, Content: tab.Content ? sanitizeRichText(tab.Content) || null : null };
}

function parseTabs(json: string | null): NoteTabRow[] {
  if (!json) return [];
  return (JSON.parse(json) as Record<string, unknown>[]).map((t) =>
    toTab({ ...t, CreatedAtUtc: utc(t.CreatedAtUtc), UpdatedAtUtc: utc(t.UpdatedAtUtc) }),
  );
}

export async function listNotes(
  params: ListParams,
  actorUserId: number,
  projectId: number | null = null,
  pageSize: number = DEFAULT_PAGE_SIZE,
): Promise<NoteListRow[]> {
  const rows = await execProc<NoteListRow>("usp_Note_List", {
    ActorUserId: actorUserId,
    ProjectId: projectId,
    ...toProcListParams(params, pageSize),
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
  return { note: noteRowSchema.parse(row), tabs: parseTabs(row?.TabsJson ?? null) };
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
    OrderJson: JSON.stringify(input.order.map((o) => ({ id: o.id, rowVer: o.rowVer }))),
    ActorUserId: actorUserId,
  });
  return rows.map(toTab);
}
