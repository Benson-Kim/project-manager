import { customColumnRepository } from "@/lib/custom-columns/repository";
import { SUPPLIER_BUILT_IN_COLUMNS } from "../schemas/columns";

/** The supplier list's column names and added columns, per project; the procs check access and audit. */
export const supplierColumns = customColumnRepository("Supplier", SUPPLIER_BUILT_IN_COLUMNS);
