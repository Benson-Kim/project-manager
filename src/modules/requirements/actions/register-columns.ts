"use server";

import { customColumnActions } from "@/lib/custom-columns/actions";
import { REGISTER_BUILT_IN_COLUMNS } from "../schemas/register-columns";

const columns = customColumnActions({
  entity: "Requirement",
  builtIns: REGISTER_BUILT_IN_COLUMNS,
  resource: "requirements",
  page: ["/projects/[id]/requirements"],
});

export const setColumnLabelAction = columns.setLabel;
export const clearColumnLabelAction = columns.clearLabel;
export const createRegisterColumnAction = columns.createColumn;
export const renameRegisterColumnAction = columns.renameColumn;
export const moveRegisterColumnAction = columns.moveColumn;
export const setRegisterColumnKindAction = columns.setColumnKind;
export const deleteRegisterColumnAction = columns.deleteColumn;
export const createChoiceAction = columns.createChoice;
export const renameChoiceAction = columns.renameChoice;
export const deleteChoiceAction = columns.deleteChoice;
export const setRegisterCellAction = columns.setCell;
