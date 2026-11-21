import { customColumnRepository } from "@/lib/custom-columns/repository";
import { REGISTER_BUILT_IN_COLUMNS } from "../schemas/register-columns";

/** The register's column names and added columns (ADR-0067); the procs check access and audit. */
const columns = customColumnRepository("Requirement", REGISTER_BUILT_IN_COLUMNS);

export const listColumnLabels = columns.listLabels;
export const setColumnLabel = columns.setLabel;
export const clearColumnLabel = columns.clearLabel;
export const listRegisterColumns = columns.listColumns;
export const createRegisterColumn = columns.createColumn;
export const renameRegisterColumn = columns.renameColumn;
export const moveRegisterColumn = columns.moveColumn;
export const setRegisterColumnKind = columns.setColumnKind;
export const deleteRegisterColumn = columns.deleteColumn;
export const createChoice = columns.createChoice;
export const renameChoice = columns.renameChoice;
export const deleteChoice = columns.deleteChoice;
export const setRegisterCell = columns.setCell;
