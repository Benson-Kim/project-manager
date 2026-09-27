import { z } from "zod";

/**
 * KeyDeliverable (app.KeyDeliverable ← tblKeyRequirementsDeliverable) — zod
 * contracts for module #9. Row schema mirrors the SELECT shape of
 * usp_KeyDeliverable_{Create,GetById,List,Update} exactly ;
 * CAST(RowVer AS BIGINT) arrives as a string and is coerced.
 */
export const rowVerSchema = z.coerce.number().int().nonnegative();

/** Fixed UI vocabularies (source data uses "Important", "Pending", "In Progress"). */
export const DELIVERABLE_STATUSES = [
  "Pending",
  "In Progress",
  "Completed",
  "On Hold",
  "Cancelled",
] as const;
export const DELIVERABLE_PRIORITIES = ["Critical", "Important", "Normal", "Low"] as const;

export const keyDeliverableRowSchema = z.object({
  KeyDeliverableId: z.number().int(),
  ProjectId: z.number().int().nullable(),
  KeyRequirement: z.string().nullable(),
  Deadline: z.date().nullable(),
  AssignedToStakeholderId: z.number().int().nullable(),
  Priority: z.string().nullable(),
  Status: z.string().nullable(),
  CreatedAtUtc: z.date(),
  UpdatedAtUtc: z.date().nullable(),
  RowVer: rowVerSchema,
});

export type KeyDeliverableRow = z.infer<typeof keyDeliverableRowSchema>;

export const keyDeliverableListRowSchema = keyDeliverableRowSchema.extend({
  TotalCount: z.number().int(),
});

export type KeyDeliverableListRow = z.infer<typeof keyDeliverableListRowSchema>;

/**
 * usp_KeyDeliverable_GanttData row: bar start basis is CreatedAtUtc (the table
 * has no explicit StartDate — module #9 decision), end is Deadline; the
 * project window (StartDate/EndDate) is the chart range basis.
 */
export const ganttRowSchema = z.object({
  KeyDeliverableId: z.number().int(),
  ProjectId: z.number().int().nullable(),
  KeyRequirement: z.string().nullable(),
  Deadline: z.date().nullable(),
  Priority: z.string().nullable(),
  Status: z.string().nullable(),
  AssignedToStakeholderId: z.number().int().nullable(),
  AssignedToName: z.string().nullable(),
  CreatedAtUtc: z.date(),
  ProjectStartDate: z.date().nullable(),
  ProjectEndDate: z.date().nullable(),
  RowVer: rowVerSchema,
});

export type GanttRow = z.infer<typeof ganttRowSchema>;

/** A drawable Gantt bar (deliverables without a deadline are not drawable). */
export interface GanttBar {
  id: number;
  requirement: string;
  /** CreatedAtUtc clamped to <= end. */
  start: Date;
  end: Date;
  status: string | null;
  priority: string | null;
  assignedToName: string | null;
  overdue: boolean;
}

export const createKeyDeliverableInput = z.object({
  projectId: z.number().int().positive(),
  keyRequirement: z.string().trim().min(1).max(4000),
  deadline: z.coerce.date().nullish(),
  assignedToStakeholderId: z.number().int().positive().nullish(),
  priority: z.string().trim().max(255).nullish(),
  status: z.string().trim().max(255).nullish(),
});

export type CreateKeyDeliverableInput = z.input<typeof createKeyDeliverableInput>;
export type CreateKeyDeliverableParsed = z.infer<typeof createKeyDeliverableInput>;

export const updateKeyDeliverableInput = createKeyDeliverableInput.extend({
  keyDeliverableId: z.number().int().positive(),
  rowVer: rowVerSchema,
});

export type UpdateKeyDeliverableInput = z.input<typeof updateKeyDeliverableInput>;
export type UpdateKeyDeliverableParsed = z.infer<typeof updateKeyDeliverableInput>;

export const deleteKeyDeliverableInput = z.object({
  keyDeliverableId: z.coerce.number().int().positive(),
  rowVer: rowVerSchema,
});

export type DeleteKeyDeliverableInput = z.input<typeof deleteKeyDeliverableInput>;

/** Module filter params (URL ⇄ usp_KeyDeliverable_List @Status/@Priority). */
export const keyDeliverableFiltersSchema = z.object({
  status: z.string().trim().max(255).optional(),
  priority: z.string().trim().max(255).optional(),
});

export type KeyDeliverableFilters = z.infer<typeof keyDeliverableFiltersSchema>;

/** Overdue = past deadline and not in a terminal status (danger badge, both views). */
export function isOverdue(
  deadline: Date | null,
  status: string | null,
  now: Date = new Date(),
): boolean {
  if (!deadline) return false;
  if (status === "Completed" || status === "Cancelled") return false;
  return deadline.getTime() < now.getTime();
}
