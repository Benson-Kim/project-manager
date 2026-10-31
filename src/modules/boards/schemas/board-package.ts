import { z } from "zod";
import { MAX_CARDS_PER_PACKAGE } from "./board-rules";
export const packageRequirementsInput = z.object({
  boardId: z.number().int().positive(),
  boardColumnId: z.number().int().positive(),
  boardSprintId: z.number().int().positive().nullish(),
  requirementIds: z.array(z.number().int().positive()).min(1).max(MAX_CARDS_PER_PACKAGE),
});
export type PackageRequirementsInput = z.input<typeof packageRequirementsInput>;

/** Deliverables as cards (ADR-0052). The card dialog lists them with listDeliverableOptions, the
 *  same numbered breakdown the work breakdown shows. */
export const packageDeliverablesInput = z.object({
  boardId: z.number().int().positive(),
  boardColumnId: z.number().int().positive(),
  boardSprintId: z.number().int().positive().nullish(),
  keyDeliverableIds: z.array(z.number().int().positive()).min(1).max(MAX_CARDS_PER_PACKAGE),
});
export type PackageDeliverablesInput = z.input<typeof packageDeliverablesInput>;
