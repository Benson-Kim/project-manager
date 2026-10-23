import { messages } from "@/lib/messages";

/**
 * Pure board rules (ADR-0038), shared by the contracts, the views and the
 * guardrail that compares them with the CHECK constraints. DOM-free so Vitest
 * covers them (ADR-0013).
 */

/** A column's place in the flow. Must equal CK_BoardColumn_Category. */
export const COLUMN_CATEGORIES = ["todo", "doing", "done"] as const;

export type ColumnCategory = (typeof COLUMN_CATEGORIES)[number];

/** A sprint's lifecycle, which only ever moves forward. Must equal CK_BoardSprint_State. */
export const SPRINT_STATES = ["planned", "active", "completed"] as const;

export type SprintState = (typeof SPRINT_STATES)[number];

/** The columns usp_Board_List sorts by; any other value falls back to its tiebreak. */
export const BOARD_SORT_KEYS = ["Name", "ProjectName", "UpdatedAtUtc"] as const;

/** usp_Board_Create refuses more than this many starting columns. */
export const MAX_BOARD_COLUMNS = 12;

/** app.BoardColumn.Name. */
export const BOARD_COLUMN_NAME_MAX = 60;

export interface BoardColumnDraft {
  name: string;
  category: ColumnCategory;
  wipLimit: number | null;
}

/**
 * The columns a new board starts with. The names come from the copy rather than
 * from SQL, so the web and desktop editions create the same board and the names
 * translate with the rest of the interface.
 */
export function defaultBoardColumns(): BoardColumnDraft[] {
  const { todo, doing, done } = messages.boards.defaultColumns;
  return [
    { name: todo, category: "todo", wipLimit: null },
    { name: doing, category: "doing", wipLimit: null },
    { name: done, category: "done", wipLimit: null },
  ];
}
