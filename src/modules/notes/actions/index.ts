"use server";

import { action } from "@/lib/action";
import {
  createNote,
  createNoteSection,
  createNoteTab,
  deleteNote,
  deleteNoteSection,
  deleteNoteTab,
  moveNoteTab,
  reorderNoteSections,
  reorderNoteTabs,
  ungroupNoteSections,
  updateNote,
  updateNoteSection,
  updateNoteTab,
} from "../repository/notes";
import {
  createNoteSchema,
  createNoteSectionSchema,
  createNoteTabSchema,
  deleteNoteSchema,
  deleteNoteSectionSchema,
  deleteNoteTabSchema,
  moveNoteTabSchema,
  reorderNoteSectionsSchema,
  reorderNoteTabsSchema,
  ungroupNoteSectionsSchema,
  updateNoteSchema,
  updateNoteSectionSchema,
  updateNoteTabSchema,
} from "../schemas/note";

/**
 * Notes actions (ADR-0035). The project level is checked in-proc (ADR-0021) and every
 * write is audited in-proc. Contributors create and edit; deletes need a Manager.
 * Tabs group a notebook's pages (ADR-0053); removing them keeps every page, so it is an edit.
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

export const moveNoteTabAction = action({
  name: "notes.page-move",
  schema: moveNoteTabSchema,
  permission: "notes:update",
  handler: (input, ctx) => moveNoteTab(input, ctx.session.userId),
});

export const createNoteSectionAction = action({
  name: "notes.tab-create",
  schema: createNoteSectionSchema,
  permission: "notes:create",
  handler: (input, ctx) => createNoteSection(input, ctx.session.userId),
});

export const updateNoteSectionAction = action({
  name: "notes.tab-update",
  schema: updateNoteSectionSchema,
  permission: "notes:update",
  handler: (input, ctx) => updateNoteSection(input, ctx.session.userId),
});

export const deleteNoteSectionAction = action({
  name: "notes.tab-delete",
  schema: deleteNoteSectionSchema,
  permission: "notes:delete",
  handler: async (input, ctx) => {
    await deleteNoteSection(input.sectionId, input.rowVer, ctx.session.userId);
    return { sectionId: input.sectionId };
  },
});

export const reorderNoteSectionsAction = action({
  name: "notes.tab-reorder",
  schema: reorderNoteSectionsSchema,
  permission: "notes:update",
  handler: (input, ctx) => reorderNoteSections(input, ctx.session.userId),
});

export const ungroupNoteSectionsAction = action({
  name: "notes.tab-remove-all",
  schema: ungroupNoteSectionsSchema,
  permission: "notes:update",
  handler: async (input, ctx) => {
    await ungroupNoteSections(input, ctx.session.userId);
    return { noteId: input.noteId };
  },
});
