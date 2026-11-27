"use server";

import { customColumnActions } from "@/lib/custom-columns/actions";
import { KEYWORD_BUILT_IN_COLUMNS } from "../schemas/columns";

const columns = customColumnActions({
  entity: "Keyword",
  builtIns: KEYWORD_BUILT_IN_COLUMNS,
  resource: "keywords",
  page: ["/projects/[id]/keywords"],
});

export const setKeywordColumnLabelAction = columns.setLabel;
export const clearKeywordColumnLabelAction = columns.clearLabel;
export const createKeywordColumnAction = columns.createColumn;
export const renameKeywordColumnAction = columns.renameColumn;
export const moveKeywordColumnAction = columns.moveColumn;
export const setKeywordColumnKindAction = columns.setColumnKind;
export const deleteKeywordColumnAction = columns.deleteColumn;
export const createKeywordChoiceAction = columns.createChoice;
export const renameKeywordChoiceAction = columns.renameChoice;
export const deleteKeywordChoiceAction = columns.deleteChoice;
export const setKeywordCellAction = columns.setCell;
