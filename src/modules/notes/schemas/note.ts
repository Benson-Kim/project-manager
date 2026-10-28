import { z } from "zod";
import type { ListSort } from "@/lib/list-params";
import { actorAccessFields } from "@/lib/auth/actor-access";
import { messages } from "@/lib/messages";
import { richTextSchema } from "@/lib/rich-text/schema";
import { rowVerSchema } from "@/modules/projects/schemas/project";

/**
 * Notes — zod contracts (ADR-0035). A Note is a notebook; its pages are NoteTabs.
 * Row schemas mirror the SELECT shapes of the note / note-tab procs; the form
 * schemas are shared by the browser and the Server Actions (FormData strings
 * coerced). Page content is rich text, sanitised on the server (ADR-0025).
 */

export const NOTE_TITLE_MAX = 255;
export const NOTE_RICH_TEXT_MAX = 200_000;
/** A notebook holds at most this many live pages, so a reorder (which names every page) fits. */
export const NOTE_PAGES_MAX = 500;
export const NOTE_REORDER_MAX = NOTE_PAGES_MAX;

const id = z.coerce.number().int().positive();

const title = z
  .string()
  .trim()
  .min(1, messages.errors.VALIDATION)
  .max(NOTE_TITLE_MAX, messages.errors.VALIDATION);

export const noteRowSchema = z.object({
  NoteId: z.number().int(),
  ProjectId: z.number().int().nullable(),
  Title: z.string().nullable(),
  CreatedAtUtc: z.date(),
  UpdatedAtUtc: z.date().nullable(),
  RowVer: rowVerSchema,
});

export type NoteRow = z.infer<typeof noteRowSchema>;

export const noteListRowSchema = noteRowSchema.extend({
  ProjectName: z.string().nullable(),
  TabCount: z.number().int(),
  LastEditedAtUtc: z.date(),
  TotalCount: z.number().int(),
  ...actorAccessFields,
});

export type NoteListRow = z.infer<typeof noteListRowSchema>;

export const noteTabRowSchema = z.object({
  NoteTabId: z.number().int(),
  NoteId: z.number().int(),
  ProjectId: z.number().int().nullable(),
  Title: z.string().nullable(),
  Content: z.string().nullable(),
  SortOrder: z.number().int(),
  CreatedAtUtc: z.coerce.date(),
  UpdatedAtUtc: z.coerce.date().nullable(),
  RowVer: rowVerSchema,
});

export type NoteTabRow = z.infer<typeof noteTabRowSchema>;

export interface NoteWorkspace {
  note: NoteRow;
  tabs: NoteTabRow[];
}

/** No project id (absent, null or "") makes a notebook in the project-less shared space. */
export const createNoteSchema = z.object({
  projectId: z.preprocess((v) => (v === undefined || v === "" ? null : v), id.nullable()),
  title,
});
export const updateNoteSchema = z.object({ noteId: id, title, rowVer: rowVerSchema });
export const deleteNoteSchema = z.object({ noteId: id, rowVer: rowVerSchema });

export const createNoteTabSchema = z.object({ noteId: id, title });
export const updateNoteTabSchema = z.object({
  noteTabId: id,
  title,
  content: richTextSchema({ max: NOTE_RICH_TEXT_MAX }),
  rowVer: rowVerSchema,
});
export const deleteNoteTabSchema = z.object({ noteTabId: id, rowVer: rowVerSchema });

export const reorderNoteTabsSchema = z.object({
  noteId: id,
  order: z
    .array(z.object({ id, rowVer: rowVerSchema }))
    .max(NOTE_REORDER_MAX)
    .refine(
      (items) => new Set(items.map((i) => i.id)).size === items.length,
      messages.errors.VALIDATION,
    ),
});

export type CreateNoteValues = z.output<typeof createNoteSchema>;
export type UpdateNoteValues = z.output<typeof updateNoteSchema>;
export type CreateNoteTabValues = z.output<typeof createNoteTabSchema>;
export type UpdateNoteTabValues = z.output<typeof updateNoteTabSchema>;
export type ReorderNoteTabsValues = z.output<typeof reorderNoteTabsSchema>;

/**
 * The orders usp_Note_List applies (ADR-0016, ADR-0035). Null default: the proc
 * falls back to NoteId, the order the notebooks were made in.
 */
export const NOTE_SORT: ListSort = {
  columns: ["Title", "ProjectName", "TabCount", "LastEditedAtUtc"],
  default: null,
};
