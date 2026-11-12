"use server";

import { action } from "@/lib/action";
import {
  createChecklist,
  createColumn,
  createItem,
  deleteChecklist,
  deleteColumn,
  deleteItem,
  moveColumn,
  renameChecklist,
  renameColumn,
  runTodo,
  setCell,
  setItemDone,
  updateItem,
} from "../repository/checklists";
import {
  createChecklistInput,
  createColumnInput,
  createItemInput,
  deleteChecklistInput,
  deleteColumnInput,
  deleteItemInput,
  moveColumnInput,
  renameChecklistInput,
  renameColumnInput,
  runTodoInput,
  setCellInput,
  setItemDoneInput,
  updateItemInput,
} from "../schemas/checklist";

/**
 * Checklist mutations (ADR-0066). Project level and overrides are checked in-proc (ADR-0021,
 * ADR-0024) and the procs write the audit row. Row writes answer with the row and its new version,
 * which the datasheet merges, so they revalidate the page only when the set of rows changes.
 */
const PAGE = ["/projects/[id]/checklists"];

export const createChecklistAction = action({
  name: "checklists.create",
  schema: createChecklistInput,
  permission: "checklists:create",
  revalidate: PAGE,
  handler: (input, ctx) => createChecklist(input, ctx.session.userId),
});

export const renameChecklistAction = action({
  name: "checklists.rename",
  schema: renameChecklistInput,
  permission: "checklists:update",
  revalidate: PAGE,
  handler: (input, ctx) => renameChecklist(input, ctx.session.userId),
});

export const deleteChecklistAction = action({
  name: "checklists.delete",
  schema: deleteChecklistInput,
  permission: "checklists:delete",
  revalidate: PAGE,
  handler: (input, ctx) => deleteChecklist(input, ctx.session.userId),
});

export const createColumnAction = action({
  name: "checklists.column.create",
  schema: createColumnInput,
  permission: "checklists:create",
  revalidate: PAGE,
  handler: (input, ctx) => createColumn(input, ctx.session.userId),
});

export const renameColumnAction = action({
  name: "checklists.column.rename",
  schema: renameColumnInput,
  permission: "checklists:update",
  revalidate: PAGE,
  handler: (input, ctx) => renameColumn(input, ctx.session.userId),
});

export const moveColumnAction = action({
  name: "checklists.column.move",
  schema: moveColumnInput,
  permission: "checklists:update",
  revalidate: PAGE,
  handler: (input, ctx) => moveColumn(input, ctx.session.userId),
});

export const deleteColumnAction = action({
  name: "checklists.column.delete",
  schema: deleteColumnInput,
  permission: "checklists:delete",
  revalidate: PAGE,
  handler: (input, ctx) => deleteColumn(input, ctx.session.userId),
});

export const createItemAction = action({
  name: "checklists.item.create",
  schema: createItemInput,
  permission: "checklists:create",
  revalidate: PAGE,
  handler: (input, ctx) => createItem(input, ctx.session.userId),
});

export const updateItemAction = action({
  name: "checklists.item.update",
  schema: updateItemInput,
  permission: "checklists:update",
  handler: (input, ctx) => updateItem(input, ctx.session.userId),
});

export const setItemDoneAction = action({
  name: "checklists.item.done",
  schema: setItemDoneInput,
  permission: "checklists:update",
  handler: (input, ctx) => setItemDone(input, ctx.session.userId),
});

export const deleteItemAction = action({
  name: "checklists.item.delete",
  schema: deleteItemInput,
  permission: "checklists:delete",
  revalidate: PAGE,
  handler: (input, ctx) => deleteItem(input, ctx.session.userId),
});

export const setCellAction = action({
  name: "checklists.cell.set",
  schema: setCellInput,
  permission: "checklists:update",
  handler: (input, ctx) => setCell(input, ctx.session.userId),
});

export const runTodoAction = action({
  name: "checklists.cell.todo",
  schema: runTodoInput,
  permission: "todo-items:create",
  revalidate: ["/projects/[id]/todos"],
  handler: (input, ctx) => runTodo(input, ctx.session.userId),
});
