import type { ListSort } from "@/lib/list-params";
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
export const BOARD_SORT: ListSort = { columns: BOARD_SORT_KEYS, default: "Name" };

/** usp_Board_Create refuses more than this many starting columns. */
export const MAX_BOARD_COLUMNS = 12;

export const BOARD_NAME_MAX = 200;
export const BOARD_DESCRIPTION_MAX = 2000;
export const WIP_LIMIT_MAX = 999;

/** app.BoardColumn.Name. */
export const BOARD_COLUMN_NAME_MAX = 60;

/** app.BoardPhase.Name. */
export const BOARD_PHASE_NAME_MAX = 100;

/** app.BoardSprint.Name and app.BoardSprint.Goal. */
export const BOARD_SPRINT_NAME_MAX = 100;
export const BOARD_SPRINT_GOAL_MAX = 1000;

/** app.BoardCard.Title. */
export const BOARD_CARD_TITLE_MAX = 300;

/** app.BoardCard.StoryPoints. Must equal CK_BoardCard_StoryPoints. */
export const STORY_POINTS_MAX = 999;

/** app.BoardCard.Notes, as rich text (ADR-0025). The cap meetings use. */
export const BOARD_RICH_TEXT_MAX = 50_000;

/** How many cards usp_Board_GetBoard returns per column or sprint, and the ceiling it clamps to. */
export const CARDS_PER_LIST = 50;
export const CARDS_PER_LIST_MAX = 200;

/** How many requirements one packaging call may add (Part 9). */
export const MAX_CARDS_PER_PACKAGE = 200;

/**
 * The gap the card procs leave between neighbouring ranks, so a move can land
 * between two cards without renumbering the board. A guardrail holds this equal
 * to the literal in usp_BoardCard_Create and usp_BoardCard_Move: if they drift,
 * moves renumber far more often than intended and nothing fails visibly.
 */
export const SORT_KEY_GAP = 1_048_576;

/** The two views usp_Board_GetBoard serves: columns of cards, or sprints of cards. */
export const BOARD_VIEWS = ["board", "plan"] as const;

export type BoardView = (typeof BOARD_VIEWS)[number];

/**
 * What a card can say about its requirement. `restricted` is a card whose
 * requirement belongs to a project this reader cannot see: the read procs send
 * NULL in every requirement column for it, so the client never holds the text
 * to leak. `removed` is one whose requirement has since been deleted.
 */
export const REQUIREMENT_STATES = ["none", "live", "restricted", "removed"] as const;

export type RequirementState = (typeof REQUIREMENT_STATES)[number];

/** How a column's load sits against its limit; `none` is a column with no limit. */
export type WipState = "none" | "ok" | "full" | "over";

/**
 * A column can sit over its limit without anyone breaking a rule: starting a
 * sprint, completing one, or lowering the limit can each leave it there. The
 * column then shows as over and takes nothing new, which is why `over` is a
 * state of its own and not an error.
 */
export function wipState(count: number, limit: number | null): WipState {
  if (limit === null) return "none";
  if (count > limit) return "over";
  if (count >= limit) return "full";
  return "ok";
}

export interface SprintActionsSource {
  BoardSprintId: number;
  State: SprintState;
}

/** Which lifecycle buttons a sprint offers. The server decides; this decides what to show. */
export interface SprintActions {
  canEdit: boolean;
  canStart: boolean;
  canComplete: boolean;
  canDelete: boolean;
}

/**
 * A sprint's lifecycle moves planned -> active -> completed and never back, and
 * each step is its own intention on the server: usp_BoardSprint_Start,
 * usp_BoardSprint_Complete, usp_BoardSprint_Delete. This mirrors the conditions
 * those procs enforce under the board lock, so the interface offers only the
 * steps that would succeed — it does not replace them. The procs remain the
 * authority: a stale picture of the board can still earn a refusal, which is
 * why starting a second sprint answers 50007 rather than being merely hidden.
 *
 * `canStart` needs the board's active sprint, not just this row: a planned
 * sprint cannot start while another is running (UQ_BoardSprint_Active).
 * `canDelete` is planned-only — an active sprint is completed instead, and a
 * completed one is kept as the record of what the team did.
 */
export function sprintActions(
  sprint: SprintActionsSource,
  activeSprintId: number | null,
): SprintActions {
  const isActive = sprint.State === "active";
  const isPlanned = sprint.State === "planned";
  return {
    canEdit: sprint.State !== "completed",
    canStart: isPlanned && activeSprintId === null,
    canComplete: isActive,
    canDelete: isPlanned,
  };
}

export interface CardLabelSource {
  Title: string | null;
  RequirementState: RequirementState;
  RequirementType: string | null;
  RequirementNumber: number | null;
  RequirementText: string | null;
}

/**
 * What to show on a card. A card always has a title or a requirement
 * (CK_BoardCard_Content), but a reader who cannot see the requirement's project
 * gets neither, so a restricted card without a title still needs a label — and
 * that label must not hint at what it is hiding.
 */
export function cardLabel(card: CardLabelSource): string {
  if (card.Title) return card.Title;
  if (card.RequirementState === "restricted") return messages.boards.restrictedCard;
  if (card.RequirementState === "removed") return messages.boards.removedCard;
  if (card.RequirementText) return card.RequirementText;
  return messages.boards.untitledCard;
}

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
