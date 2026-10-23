"use server";

import { action } from "@/lib/action";
import {
  createNote,
  createNoteTab,
  deleteNote,
  deleteNoteTab,
  reorderNoteTabs,
  updateNote,
  updateNoteTab,
} from "../repository/notes";
import {
  createNoteSchema,
  createNoteTabSchema,
  deleteNoteSchema,
  deleteNoteTabSchema,
  reorderNoteTabsSchema,
  updateNoteSchema,
  updateNoteTabSchema,
} from "../schemas/note";

/**
 * Notes actions (ADR-0035). The project level is checked in-proc (ADR-0021) and every
 * write is audited in-proc. Contributors create and edit; deletes need a Manager.
 */

export const createNoteAction = action({
  name: "notes.create",
  schema: createNoteSchema,
  permission: "notes:create",
  handler: (input, ctx) => createNote(input, ctx.session.userId),
});

export const updateNoteAction = action({
  name: "notes.update",
  schema: updateNoteSchema,
  permission: "notes:update",
  handler: (input, ctx) => updateNote(input, ctx.session.userId),
});

export const deleteNoteAction = action({
  name: "notes.delete",
  schema: deleteNoteSchema,
  permission: "notes:delete",
  handler: async (input, ctx) => {
    await deleteNote(input.noteId, input.rowVer, ctx.session.userId);
    return { noteId: input.noteId };
  },
});

export const createNoteTabAction = action({
  name: "notes.page-create",
  schema: createNoteTabSchema,
  permission: "notes:create",
  handler: (input, ctx) => createNoteTab(input, ctx.session.userId),
});

export const updateNoteTabAction = action({
  name: "notes.page-update",
  schema: updateNoteTabSchema,
  permission: "notes:update",
  handler: (input, ctx) => updateNoteTab(input, ctx.session.userId),
});

export const deleteNoteTabAction = action({
  name: "notes.page-delete",
  schema: deleteNoteTabSchema,
  permission: "notes:delete",
  handler: async (input, ctx) => {
    await deleteNoteTab(input.noteTabId, input.rowVer, ctx.session.userId);
    return { noteTabId: input.noteTabId };
  },
});

export const reorderNoteTabsAction = action({
  name: "notes.page-reorder",
  schema: reorderNoteTabsSchema,
  permission: "notes:update",
  handler: (input, ctx) => reorderNoteTabs(input, ctx.session.userId),
});
