import { z } from "zod";
import { MAX_CARDS_PER_PACKAGE } from "./board-rules";
export const packageRequirementsInput = z.object({
  boardId: z.number().int().positive(),
  boardColumnId: z.number().int().positive(),
  boardSprintId: z.number().int().positive().nullish(),
  requirementIds: z.array(z.number().int().positive()).min(1).max(MAX_CARDS_PER_PACKAGE),
});
export type PackageRequirementsInput = z.input<typeof packageRequirementsInput>;
