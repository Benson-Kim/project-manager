import { customColumnRepository } from "@/lib/custom-columns/repository";
import { KEYWORD_BUILT_IN_COLUMNS } from "../schemas/columns";

/** The keyword list's column names and added columns, per project; the procs check access and audit. */
export const keywordColumns = customColumnRepository("Keyword", KEYWORD_BUILT_IN_COLUMNS);
