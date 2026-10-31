import { z } from "zod";
import { OPTION_COLORS } from "@/lib/lookup-lists";
import { richTextSchema } from "@/lib/rich-text/schema";
import { rowVerSchema } from "@/modules/projects/schemas/project";
import { moscowSchema } from "@/modules/requirements/schemas/moscow";
import { REQUIREMENT_TYPES } from "@/modules/requirements/schemas/requirement-types";
import {
  BOARD_CARD_TITLE_MAX,
  BOARD_RICH_TEXT_MAX,
  REQUIREMENT_STATES,
  STORY_POINTS_MAX,
} from "./board-rules";

/**
 * Board card (app.BoardCard) — zod contracts, mirroring the SELECT shape of
 * usp_BoardCard_{Create,GetById,Update,Move} and set 5 of usp_Board_GetBoard.
 *
 * Every input is an explicit allow-list. BoardCardId, BoardId, RequirementId,
 * CreatedBy, SortKey and RowVer are the server's to set, so a payload can never
 * carry a field the proc does not take: a card cannot be re-boarded, attached to
 * a requirement, or re-ranked by editing it. Moving is its own intention
 * (usp_BoardCard_Move, which checks the WIP limit), and attaching a requirement
 * is packaging.
 */

/** app.BoardCard.SortKey. BIGINT, and a head insert may rank a card below zero. */
const sortKeySchema = z.coerce.number().int();

const cardTitle = z.string().trim().min(1).max(BOARD_CARD_TITLE_MAX);
const storyPoints = z.number().int().min(0).max(STORY_POINTS_MAX).nullable();
const cardColor = z.enum(OPTION_COLORS).nullable();

/** The requirement columns every card read carries, NULL on a redacted card. */
const requirementFields = {
  RequirementState: z.enum(REQUIREMENT_STATES),
  RequirementId: z.number().int().nullable(),
  RequirementType: z.enum(REQUIREMENT_TYPES).nullable(),
  RequirementNumber: z.number().int().nullable(),
  RequirementRef: z.string().nullable().default(null),
  RequirementText: z.string().nullable(),
  RequirementIsMet: z.boolean().nullable(),
  RequirementProjectId: z.number().int().nullable(),
  RequirementMoSCoW: moscowSchema.nullable(),
};

/**
 * The deliverable columns every card read carries (ADR-0052), from dbo.ufn_BoardCard_Deliverable:
 * NULL on a redacted or removed card, the same four states as a requirement. The counts are over
 * the deliverable's allocated requirements, sub-requirements included.
 */
const deliverableFields = {
  DeliverableState: z.enum(REQUIREMENT_STATES),
  KeyDeliverableId: z.number().int().nullable(),
  DeliverableProjectId: z.number().int().nullable(),
  DeliverableTitle: z.string().nullable(),
  DeliverableStatus: z.string().nullable(),
  DeliverablePriority: z.string().nullable(),
  DeliverableColor: z.enum(OPTION_COLORS).nullable(),
  DeliverableStartDate: z.date().nullable(),
  DeliverableDeadline: z.date().nullable(),
  DeliverableRequirementCount: z.number().int().nonnegative().nullable(),
  DeliverableMetCount: z.number().int().nonnegative().nullable(),
  DeliverableMustCount: z.number().int().nonnegative().nullable(),
  DeliverableMustMetCount: z.number().int().nonnegative().nullable(),
  DeliverableShouldCount: z.number().int().nonnegative().nullable(),
  DeliverableCouldCount: z.number().int().nonnegative().nullable(),
  DeliverableWontCount: z.number().int().nonnegative().nullable(),
};

/** What the card write procs return. */
export const boardCardRowSchema = z.object({
  BoardCardId: z.number().int(),
  BoardId: z.number().int(),
  BoardColumnId: z.number().int(),
  BoardSprintId: z.number().int().nullable(),
  RequirementId: z.number().int().nullable(),
  KeyDeliverableId: z.number().int().nullable(),
  Title: z.string().nullable(),
  AssigneeUserId: z.number().int().nullable(),
  DueDate: z.date().nullable(),
  StoryPoints: z.number().int().nullable(),
  Color: z.enum(OPTION_COLORS).nullable(),
  SortKey: sortKeySchema,
  RowVer: rowVerSchema,
});

export type BoardCardRow = z.infer<typeof boardCardRowSchema>;

/** usp_Board_GetBoard set 5: a card as the board and planning views draw it. */
export const boardCardListRowSchema = boardCardRowSchema
  .omit({ RequirementId: true, KeyDeliverableId: true })
  .extend({ ...requirementFields, ...deliverableFields });

export type BoardCardListRow = z.infer<typeof boardCardListRowSchema>;

/** usp_BoardCard_GetById set 2: the carried deliverable's requirements, for the drawer (ADR-0052). */
export const cardDeliverableRequirementSchema = z.object({
  RequirementId: z.number().int(),
  RequirementType: z.enum(REQUIREMENT_TYPES),
  Ref: z.string().min(1),
  SortPath: z.string().min(1),
  Depth: z.number().int().nonnegative(),
  ParentRequirementId: z.number().int().nullable(),
  Requirement: z.string(),
  IsMet: z.boolean(),
  MoSCoW: moscowSchema.nullable(),
  AcceptanceCriteria: z.string().nullable(),
  EstimateDays: z.number().nonnegative().nullable(),
  OwnerStakeholderId: z.number().int().nullable(),
  RowVer: rowVerSchema,
  PlaceRowVer: rowVerSchema,
});

export type CardDeliverableRequirement = z.infer<typeof cardDeliverableRequirementSchema>;

/** usp_BoardCard_GetById: the card sheet, which is the only read that loads Notes. */
export const boardCardDetailRowSchema = boardCardListRowSchema.extend({
  Notes: z.string().nullable(),
  AssigneeName: z.string().nullable(),
  CreatedBy: z.number().int(),
  CreatedAtUtc: z.date(),
  UpdatedAtUtc: z.date().nullable(),
  /** The carried requirement's version, NULL unless it is live: the sheet's met tick and MoSCoW. */
  RequirementRowVer: rowVerSchema.nullable(),
  /** Set 2, attached by the repository; empty unless the deliverable is live. */
  DeliverableRequirements: z.array(cardDeliverableRequirementSchema),
});

export type BoardCardDetailRow = z.infer<typeof boardCardDetailRowSchema>;

export const createBoardCardInput = z.object({
  boardId: z.number().int().positive(),
  boardColumnId: z.number().int().positive(),
  boardSprintId: z.number().int().positive().nullish(),
  title: cardTitle,
  notes: richTextSchema({ max: BOARD_RICH_TEXT_MAX }).nullish(),
  assigneeUserId: z.number().int().positive().nullish(),
  dueDate: z.coerce.date().nullish(),
  storyPoints: storyPoints.nullish(),
  color: cardColor.nullish(),
});

export type CreateBoardCardInput = z.input<typeof createBoardCardInput>;

/**
 * An edit carries every field it owns, so leaving one out clears it rather than
 * keeping an old value the user can no longer see (the standards' explicit-update
 * rule). The fields an edit does NOT own — column, sprint, board, requirement,
 * rank — are simply absent.
 */
export const updateBoardCardInput = z.object({
  boardCardId: z.number().int().positive(),
  rowVer: rowVerSchema,
  title: cardTitle.nullable(),
  notes: richTextSchema({ max: BOARD_RICH_TEXT_MAX }).nullish(),
  assigneeUserId: z.number().int().positive().nullable(),
  dueDate: z.coerce.date().nullable(),
  storyPoints: storyPoints,
  color: cardColor,
});

export type UpdateBoardCardInput = z.input<typeof updateBoardCardInput>;

/**
 * `sprintSet` separates "leave the sprint alone" from "set it to sprintId,
 * null meaning the backlog". Without it a null could not say which was meant,
 * and every column move would quietly send the card to the backlog.
 */
export const moveBoardCardInput = z.object({
  boardCardId: z.number().int().positive(),
  rowVer: rowVerSchema,
  toColumnId: z.number().int().positive(),
  toSprintId: z.number().int().positive().nullish(),
  sprintSet: z.boolean().default(false),
  beforeCardId: z.number().int().positive().nullish(),
});

export type MoveBoardCardInput = z.input<typeof moveBoardCardInput>;

export const deleteBoardCardInput = z.object({
  boardCardId: z.number().int().positive(),
  rowVer: rowVerSchema,
});

export type DeleteBoardCardInput = z.input<typeof deleteBoardCardInput>;

/**
 * Linking a requirement to an existing card is its own intention, not a field on
 * an edit. NULL requirementId unlinks; a positive id links. The proc checks the
 * requirement's project, the unique constraint, and CK_BoardCard_Content.
 */
export const linkBoardCardInput = z.object({
  boardCardId: z.number().int().positive(),
  rowVer: rowVerSchema,
  requirementId: z.number().int().positive().nullable(),
});

export type LinkBoardCardInput = z.input<typeof linkBoardCardInput>;

/** Card details are a read intention; no row version or write contract. */
export const readBoardCardInput = z.object({ boardCardId: z.number().int().positive() });
