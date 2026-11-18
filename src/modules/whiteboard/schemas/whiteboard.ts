import { z } from "zod";
import { rowVerSchema } from "@/modules/projects/schemas/project";
import {
  BOARD_JSON_MAX_LENGTH,
  BOARD_SCENE_VERSION,
  EMPTY_BOARD_SCENE,
  UNSTORED_ELEMENT_TYPES,
  type BoardScene,
} from "../model/scene";

export const WHITEBOARD_NAME_MAX = 120;

export const whiteboardIdSchema = z.coerce.number().int().positive();
export const whiteboardNameSchema = z.string().trim().min(1).max(WHITEBOARD_NAME_MAX);

const elementSchema = z
  .looseObject({
    id: z.string().min(1).max(100),
    type: z.string().min(1).max(40),
  })
  .refine((element) => !UNSTORED_ELEMENT_TYPES.has(element.type), { path: ["type"] });

const appStateSchema = z.object({
  viewBackgroundColor: z.string().min(1).max(64),
  gridSize: z.number().int().min(1).max(200).nullable().optional(),
});

/** Stored BoardJson: no images and no `files` in v1; appState keeps only the background and grid. */
export const boardSceneSchema = z
  .strictObject({
    version: z.literal(BOARD_SCENE_VERSION),
    elements: z.array(elementSchema),
    appState: appStateSchema,
  })
  .refine((scene) => JSON.stringify(scene).length <= BOARD_JSON_MAX_LENGTH, {
    path: ["elements"],
  }) satisfies z.ZodType<BoardScene>;

/**
 * A stored board that no longer reads as a scene opens empty and unreadable, so the page shows it
 * read-only instead of saving the empty board over it.
 */
export function readBoardScene(json: string): { scene: BoardScene; readable: boolean } {
  try {
    const parsed = boardSceneSchema.safeParse(JSON.parse(json));
    if (parsed.success) return { scene: parsed.data, readable: true };
  } catch {
    // not JSON: falls through to the unreadable board
  }
  return { scene: EMPTY_BOARD_SCENE, readable: false };
}

/** One row of usp_Whiteboard_List and _Create. */
export const whiteboardSummarySchema = z.object({
  WhiteboardId: z.number().int(),
  Name: z.string(),
  RowVer: rowVerSchema,
});
export type WhiteboardSummary = z.infer<typeof whiteboardSummarySchema>;

/** usp_Whiteboard_GetById: the board stays text here; readBoardScene reads it. */
export const whiteboardRowSchema = whiteboardSummarySchema.extend({
  ProjectId: z.number().int(),
  BoardJson: z.string(),
});
export type WhiteboardRow = z.infer<typeof whiteboardRowSchema>;

export const savedWhiteboardSchema = z.object({
  WhiteboardId: z.number().int(),
  ProjectId: z.number().int(),
  RowVer: rowVerSchema,
});
export type SavedWhiteboard = z.infer<typeof savedWhiteboardSchema>;

export const createWhiteboardInput = z.strictObject({
  projectId: whiteboardIdSchema,
  name: whiteboardNameSchema,
});
export type CreateWhiteboardInput = z.infer<typeof createWhiteboardInput>;

export const renameWhiteboardInput = z.strictObject({
  whiteboardId: whiteboardIdSchema,
  name: whiteboardNameSchema,
  rowVer: rowVerSchema,
});
export type RenameWhiteboardInput = z.infer<typeof renameWhiteboardInput>;

export const saveWhiteboardInput = z.strictObject({
  whiteboardId: whiteboardIdSchema,
  board: boardSceneSchema,
  rowVer: rowVerSchema,
});
export type SaveWhiteboardInput = z.infer<typeof saveWhiteboardInput>;

export const deleteWhiteboardInput = z.strictObject({
  whiteboardId: whiteboardIdSchema,
  rowVer: rowVerSchema,
});
export type DeleteWhiteboardInput = z.infer<typeof deleteWhiteboardInput>;
