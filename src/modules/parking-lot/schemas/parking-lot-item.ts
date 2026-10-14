import { z } from "zod";
import { actorAccessFields } from "@/lib/auth/actor-access";
import { listValue, type LookupListKey } from "@/lib/lookup-lists";
import { rowVerSchema } from "@/modules/projects/schemas/project";

/**
 * ParkingLotItem — zod contracts. Row schema mirrors the SELECT shape of
 * usp_ParkingLotItem_{Create,GetById,List,Update}.
 *
 * StakeholderId is optional (maps to Participant in the source Access DB).
 * Status is the managed list 'parking-lot-item.status' (migration 031). The procs
 * keep IsStrikethrough equal to Status = "Resolved": the item reads struck through.
 */

/** Dropdown lists (ADR-0022). */
export const PARKING_LOT_LISTS = [
  "parking-lot-item.status",
] as const satisfies readonly LookupListKey[];

/** Locked labels the code reads by name (migration 031). */
export const PARKING_LOT_STATUS = { active: "Active", resolved: "Resolved" } as const;

export const parkingLotItemRowSchema = z.object({
  ParkingLotItemId: z.number().int(),
  ProjectId: z.number().int(),
  ParkingLotItem: z.string().nullable(),
  StakeholderId: z.number().int().nullable(),
  IsStrikethrough: z.boolean(),
  Status: z.string().nullable(),
  FollowUpActions: z.string().nullable(),
  Owner: z.string().nullable(),
  CreatedAtUtc: z.date(),
  UpdatedAtUtc: z.date().nullable(),
  RowVer: rowVerSchema,
});

export type ParkingLotItemRow = z.infer<typeof parkingLotItemRowSchema>;

export const parkingLotItemListRowSchema = parkingLotItemRowSchema.extend({
  TotalCount: z.number().int(),
  ...actorAccessFields,
});

export type ParkingLotItemListRow = z.infer<typeof parkingLotItemListRowSchema>;

// ── Mutation input schemas (used by repository) ───────────────────────────────

export const createParkingLotItemInput = z.object({
  projectId: z.number().int().positive(),
  parkingLotItem: z.string().trim().min(1).max(255),
  stakeholderId: z.number().int().positive().nullish(),
  /** NULL: Active on create, unchanged on update (the proc decides). */
  status: listValue.nullish(),
  followUpActions: z.string().trim().max(4000).nullish(),
  owner: z.string().trim().max(255).nullish(),
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
