"use server";

import { customColumnActions } from "@/lib/custom-columns/actions";
import { SUPPLIER_BUILT_IN_COLUMNS } from "../schemas/columns";

const columns = customColumnActions({
  entity: "Supplier",
  builtIns: SUPPLIER_BUILT_IN_COLUMNS,
  resource: "suppliers",
  page: ["/projects/[id]/suppliers"],
});

export const setSupplierColumnLabelAction = columns.setLabel;
export const clearSupplierColumnLabelAction = columns.clearLabel;
export const createSupplierColumnAction = columns.createColumn;
export const renameSupplierColumnAction = columns.renameColumn;
export const moveSupplierColumnAction = columns.moveColumn;
export const setSupplierColumnKindAction = columns.setColumnKind;
export const deleteSupplierColumnAction = columns.deleteColumn;
export const createSupplierChoiceAction = columns.createChoice;
export const renameSupplierChoiceAction = columns.renameChoice;
export const deleteSupplierChoiceAction = columns.deleteChoice;
export const setSupplierCellAction = columns.setCell;
