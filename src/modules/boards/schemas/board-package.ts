import { z } from "zod";
export const packageRequirementsInput = z.object({
  boardId: z.number().int().positive(),
  boardColumnId: z.number().int().positive(),
  boardSprintId: z.number().int().positive().nullish(),
  requirementIds: z.array(z.number().int().positive()).min(1).max(200),
});
export type PackageRequirementsInput = z.input<typeof packageRequirementsInput>;
