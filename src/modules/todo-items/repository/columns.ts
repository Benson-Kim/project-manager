import { customColumnRepository } from "@/lib/custom-columns/repository";
import { TODO_ITEM_BUILT_IN_COLUMNS } from "../schemas/columns";

/** The to-do list's column names and added columns, per project; the procs check access and audit. */
export const todoColumns = customColumnRepository("TodoItem", TODO_ITEM_BUILT_IN_COLUMNS);
