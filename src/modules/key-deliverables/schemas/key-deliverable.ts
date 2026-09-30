import { z } from "zod";

/**
 * KeyDeliverable (app.KeyDeliverable ← tblKeyRequirementsDeliverable) — zod
 * contracts for module #9. Row schema mirrors the SELECT shape of
 * usp_KeyDeliverable_{Create,GetById,List,Update} exactly;
 * CAST(RowVer AS BIGINT) arrives as a string and is coerced.
 *
 * Schema changes (migration 015):
 * - RequestedDate: nullable date — when the deliverable was requested.
 * - Deadline: maps to "expected date" in the UI (label only, column unchanged).
 * - AssignedToStakeholderId: removed; replaced by junction table.
 * - AssigneeNames: comma-separated display string from junction table.
 * - AssigneesJson: JSON array [{id, name}] from junction table.
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

/** Parsed junction-table assignee entry. */
export const assigneeEntrySchema = z.object({
  id: z.coerce.number().int().positive(),
  name: z.string(),
});
export type AssigneeEntry = z.infer<typeof assigneeEntrySchema>;

/** Parse the AssigneesJson column returned by all procs. */
function parseAssigneesJson(raw: unknown): AssigneeEntry[] {
  if (!raw || typeof raw !== "string" || raw.trim() === "") return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.map((a) => assigneeEntrySchema.parse(a));
  } catch {
    return [];
  }
}

export const keyDeliverableRowSchema = z
  .object({
    KeyDeliverableId: z.number().int(),
    ProjectId: z.number().int().nullable(),
    KeyRequirement: z.string().nullable(),
    RequestedDate: z.date().nullable().optional(),
    Deadline: z.date().nullable(),
    Priority: z.string().nullable(),
    Status: z.string().nullable(),
    CreatedAtUtc: z.date(),
    UpdatedAtUtc: z.date().nullable(),
    RowVer: rowVerSchema,
    AssigneeNames: z.string().nullable().optional(),
    AssigneesJson: z.unknown().optional(),
  })
  .transform((r) => ({
    ...r,
    Assignees: parseAssigneesJson(r.AssigneesJson),
  }));

export type KeyDeliverableRow = z.infer<typeof keyDeliverableRowSchema>;

export const keyDeliverableListRowSchema = keyDeliverableRowSchema.and(
  z.object({ TotalCount: z.number().int() }),
);

export type KeyDeliverableListRow = z.infer<typeof keyDeliverableListRowSchema>;

/**
 * usp_KeyDeliverable_GanttData row. Bar start = RequestedDate when set,
 * else CreatedAtUtc (clamped to deadline). End = Deadline.
 */
export const ganttRowSchema = z.object({
  KeyDeliverableId: z.number().int(),
  ProjectId: z.number().int().nullable(),
  KeyRequirement: z.string().nullable(),
  RequestedDate: z.date().nullable().optional(),
  Deadline: z.date().nullable(),
  Priority: z.string().nullable(),
  Status: z.string().nullable(),
  AssigneeNames: z.string().nullable().optional(),
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
  /** RequestedDate ?? CreatedAtUtc clamped to <= end. */
  start: Date;
  end: Date;
  status: string | null;
  priority: string | null;
  /** Comma-separated assignee names for display. */
  assigneeNames: string | null;
  overdue: boolean;
  /** 0–100: visual completion fill derived from status. */
  completionPct: number;
}

/** Map a status string to a completion percentage for the bar fill. */
export function statusToCompletion(status: string | null): number {
  switch (status) {
    case "Completed":   return 100;
    case "In Progress": return 50;
    case "On Hold":     return 20;
    default:            return 0;
  }
}

export const createKeyDeliverableInput = z.object({
  projectId: z.number().int().positive(),
  keyRequirement: z.string().trim().min(1).max(4000),
  requestedDate: z.coerce.date().nullish(),
  deadline: z.coerce.date().nullish(),
  assigneeIds: z.array(z.number().int().positive()).nullish(),
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
