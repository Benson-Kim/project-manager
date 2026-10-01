import { z } from "zod";
import { rowVerSchema } from "@/modules/projects/schemas/project";

/**
 * ParkingLotItem — zod contracts. Row schema mirrors the SELECT shape of
 * usp_ParkingLotItem_{Create,GetById,List,Update}.
 *
 * StakeholderId is optional (maps to Participant in the source Access DB).
 * IsStrikethrough = true means the item is resolved/struck-through.
 */

export const parkingLotItemRowSchema = z.object({
  ParkingLotItemId: z.number().int(),
  ProjectId: z.number().int(),
  ParkingLotItem: z.string().nullable(),
  StakeholderId: z.number().int().nullable(),
  IsStrikethrough: z.boolean(),
  CreatedAtUtc: z.date(),
  UpdatedAtUtc: z.date().nullable(),
  RowVer: rowVerSchema,
});

export type ParkingLotItemRow = z.infer<typeof parkingLotItemRowSchema>;

export const parkingLotItemListRowSchema = parkingLotItemRowSchema.extend({
  TotalCount: z.number().int(),
});

export type ParkingLotItemListRow = z.infer<typeof parkingLotItemListRowSchema>;

// ── Mutation input schemas (used by repository) ───────────────────────────────

export const createParkingLotItemInput = z.object({
  projectId: z.number().int().positive(),
  parkingLotItem: z.string().trim().min(1).max(255),
  stakeholderId: z.number().int().positive().nullish(),
  isStrikethrough: z.boolean().default(false),
});

export type CreateParkingLotItemInput = z.input<typeof createParkingLotItemInput>;
export type CreateParkingLotItemParsed = z.infer<typeof createParkingLotItemInput>;

export const updateParkingLotItemInput = createParkingLotItemInput.extend({
  parkingLotItemId: z.number().int().positive(),
  rowVer: rowVerSchema,
});

export type UpdateParkingLotItemInput = z.input<typeof updateParkingLotItemInput>;

export const deleteParkingLotItemInput = z.object({
  parkingLotItemId: z.coerce.number().int().positive(),
  rowVer: rowVerSchema,
});

export type DeleteParkingLotItemInput = z.input<typeof deleteParkingLotItemInput>;
