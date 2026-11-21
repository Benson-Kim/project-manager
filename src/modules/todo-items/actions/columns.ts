"use server";

import { customColumnActions } from "@/lib/custom-columns/actions";
import { TODO_ITEM_BUILT_IN_COLUMNS } from "../schemas/columns";

const columns = customColumnActions({
  entity: "TodoItem",
  builtIns: TODO_ITEM_BUILT_IN_COLUMNS,
  resource: "todo-items",
  page: ["/projects/[id]/todos"],
});

export const setTodoColumnLabelAction = columns.setLabel;
export const clearTodoColumnLabelAction = columns.clearLabel;
export const createTodoColumnAction = columns.createColumn;
export const renameTodoColumnAction = columns.renameColumn;
export const moveTodoColumnAction = columns.moveColumn;
export const setTodoColumnKindAction = columns.setColumnKind;
export const deleteTodoColumnAction = columns.deleteColumn;
export const createTodoChoiceAction = columns.createChoice;
export const renameTodoChoiceAction = columns.renameChoice;
export const deleteTodoChoiceAction = columns.deleteChoice;
export const setTodoCellAction = columns.setCell;
