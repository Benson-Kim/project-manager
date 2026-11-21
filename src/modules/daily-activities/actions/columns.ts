"use server";

import { customColumnActions } from "@/lib/custom-columns/actions";
import { DAILY_ACTIVITY_BUILT_IN_COLUMNS } from "../schemas/columns";

const columns = customColumnActions({
  entity: "DailyActivity",
  builtIns: DAILY_ACTIVITY_BUILT_IN_COLUMNS,
  resource: "daily-activities",
  page: ["/projects/[id]/daily-activities"],
});

export const setActivityColumnLabelAction = columns.setLabel;
export const clearActivityColumnLabelAction = columns.clearLabel;
export const createActivityColumnAction = columns.createColumn;
export const renameActivityColumnAction = columns.renameColumn;
export const moveActivityColumnAction = columns.moveColumn;
export const setActivityColumnKindAction = columns.setColumnKind;
export const deleteActivityColumnAction = columns.deleteColumn;
export const createActivityChoiceAction = columns.createChoice;
export const renameActivityChoiceAction = columns.renameChoice;
export const deleteActivityChoiceAction = columns.deleteChoice;
export const setActivityCellAction = columns.setCell;
