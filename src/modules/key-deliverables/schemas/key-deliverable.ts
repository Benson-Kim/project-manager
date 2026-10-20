import { z } from "zod";
import { actorAccessFields } from "@/lib/auth/actor-access";
import { OPTION_COLORS, type LookupListKey } from "@/lib/lookup-lists";
import { messages } from "@/lib/messages";
import { utcDay, type WbsItem, type WbsRequirement } from "./wbs";

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
 *
 * Work breakdown (migration 032, ADR-0027): ParentKeyDeliverableId, SortOrder,
 * StartDate (the bar's first day; Deadline is its last), Color, HasChildren
 * (a parent's dates are rolled up from its sub-items) and, from GetById only,
 * SubItemCount (the items below it that a delete also removes). Optional so a row
 * from a database before 032 still parses.
 */
export const rowVerSchema = z.coerce.number().int().nonnegative();

/**
 * Dropdown lists (ADR-0022; seeded by migration 018 from the source data's
 * "Pending", "In Progress", "Important"…). The statuses statusToCompletion()
 * and isOverdue() read by name are locked in the list.
 */
export const KEY_DELIVERABLE_LISTS = [
  "key-deliverable.status",
  "key-deliverable.priority",
] as const satisfies readonly LookupListKey[];

/** Parsed junction-table assignee entry. */
export const assigneeEntrySchema = z.object({
  id: z.coerce.number().int().positive(),
  name: z.string(),
});
export type AssigneeEntry = z.infer<typeof assigneeEntrySchema>;

/** Parse the AssigneesJson column returned by all procs.
 *  Only null / empty string maps to []; any parse or schema error propagates
 *  so that database drift or malformed data surfaces at the repository boundary
 *  rather than silently replacing valid assignees with an empty set. */
export function parseAssigneesJson(raw: unknown): AssigneeEntry[] {
  if (raw === null || raw === undefined || raw === "") return [];
  if (typeof raw !== "string") throw new Error(`AssigneesJson must be a string, got ${typeof raw}`);
  const trimmed = raw.trim();
  if (trimmed === "") return [];
  const arr: unknown = JSON.parse(trimmed); // throws on malformed JSON
  if (!Array.isArray(arr))
    throw new Error(`AssigneesJson must be a JSON array, got ${JSON.stringify(arr)}`);
  return arr.map((a) => assigneeEntrySchema.parse(a)); // throws on schema mismatch
}

/** One entry of usp_KeyDeliverable_GanttData's RequirementsJson (migration 035, ADR-0036). */
const requirementEntrySchema = z
  .object({
    id: z.number().int().positive(),
    requirement: z.string(),
    isMet: z.union([z.boolean(), z.literal(0), z.literal(1)]).transform(Boolean),
    sortOrder: z.number().int(),
    rowVer: rowVerSchema,
  })
  .transform(
    (r): WbsRequirement => ({
      id: r.id,
      text: r.requirement,
      isMet: r.isMet,
      sortOrder: r.sortOrder,
      rowVer: r.rowVer,
    }),
  );

/**
 * Parse the RequirementsJson column: NULL (no requirements, or a database
 * before migration 035) is []; anything malformed throws at the boundary, as
 * parseAssigneesJson does.
 */
export function parseRequirementsJson(raw: unknown): WbsRequirement[] {
  if (raw === null || raw === undefined || raw === "") return [];
  if (typeof raw !== "string") {
    throw new Error(`RequirementsJson must be a string, got ${typeof raw}`);
  }
  const arr: unknown = JSON.parse(raw);
  if (!Array.isArray(arr)) throw new Error("RequirementsJson must be a JSON array");
  return arr
    .map((r) => requirementEntrySchema.parse(r))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
}

/** A bar colour: a palette key (CK_KeyDeliverable_Color); NULL takes the parent's. */
export const wbsColorSchema = z.enum(OPTION_COLORS).nullable();

export const keyDeliverableRowSchema = z
  .object({
    KeyDeliverableId: z.number().int(),
    ProjectId: z.number().int().nullable(),
    KeyRequirement: z.string().nullable(),
    ParentKeyDeliverableId: z.number().int().nullable().optional(),
    SortOrder: z.number().int().optional(),
    RequestedDate: z.date().nullable().optional(),
    StartDate: z.date().nullable().optional(),
    Deadline: z.date().nullable(),
    Priority: z.string().nullable(),
    Status: z.string().nullable(),
    Color: wbsColorSchema.optional(),
    HasChildren: z.boolean().optional(),
    SubItemCount: z.number().int().nonnegative().optional(),
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
  z.object({
    TotalCount: z.number().int(),
    /** "1.2.3", the item's number in its project's breakdown. */
    WbsCode: z.string().nullable().optional(),
    ...actorAccessFields,
  }),
);

export type KeyDeliverableListRow = z.infer<typeof keyDeliverableListRowSchema>;

/** usp_KeyDeliverable_GanttData row: one item of the project's work breakdown. */
export const wbsRowSchema = z
  .object({
    KeyDeliverableId: z.number().int(),
    ProjectId: z.number().int().nullable(),
    ParentKeyDeliverableId: z.number().int().nullable(),
    SortOrder: z.number().int(),
    KeyRequirement: z.string().nullable(),
    RequestedDate: z.date().nullable(),
    StartDate: z.date().nullable(),
    Deadline: z.date().nullable(),
    Priority: z.string().nullable(),
    Status: z.string().nullable(),
    Color: wbsColorSchema,
    AssigneeNames: z.string().nullable().optional(),
    AssigneesJson: z.unknown().optional(),
    RequirementsJson: z.unknown().optional(),
    CreatedAtUtc: z.date(),
    RowVer: rowVerSchema,
  })
  .transform((r): WbsItem => ({
    id: r.KeyDeliverableId,
    parentId: r.ParentKeyDeliverableId,
    sortOrder: r.SortOrder,
    name: r.KeyRequirement ?? "",
    requestedDate: r.RequestedDate,
    start: r.StartDate,
    end: r.Deadline,
    status: r.Status,
    priority: r.Priority,
    color: r.Color,
    assigneeNames: r.AssigneeNames?.trim() || null,
    assignees: parseAssigneesJson(r.AssigneesJson),
    requirements: parseRequirementsJson(r.RequirementsJson),
    rowVer: r.RowVer,
  }));

/**
 * The project columns on every usp_KeyDeliverable_GanttData row (on its one
 * row when the project has no items yet).
 */
export const wbsWindowSchema = z.object({
  ProjectStartDate: z.date().nullable(),
  ProjectEndDate: z.date().nullable(),
  Stamp: z.coerce.number().int().nonnegative(),
});

/** The project's breakdown and its window (for a first item's default dates). */
export interface WbsData {
  items: WbsItem[];
  projectStart: Date | null;
  projectEnd: Date | null;
  /** Orders two reads of the breakdown: the larger one is the newer. */
  stamp: number;
}

/** Map a status string to a completion percentage for the bar fill. */
export function statusToCompletion(status: string | null): number {
  switch (status) {
    case "Completed":
      return 100;
    case "In Progress":
      return 50;
    case "On Hold":
      return 20;
    default:
      return 0;
  }
}

const deliverableFields = {
  projectId: z.number().int().positive(),
  keyRequirement: z.string().trim().min(1).max(4000),
  requestedDate: z.coerce.date().nullish(),
  startDate: z.coerce.date().nullish(),
  deadline: z.coerce.date().nullish(),
  assigneeIds: z.array(z.number().int().positive()).nullish(),
  priority: z.string().trim().max(255).nullish(),
  status: z.string().trim().max(255).nullish(),
  /** Omitted = keep the colour (update); null = the parent's colour. */
  color: wbsColorSchema.optional(),
};

const itemId = z.number().int().positive();

/** A new deliverable goes under parentId (null = top level), after the sibling afterId or last. */
export const createKeyDeliverableInput = z.object({
  ...deliverableFields,
  parentId: itemId.nullish(),
  afterId: itemId.nullish(),
});

export type CreateKeyDeliverableInput = z.input<typeof createKeyDeliverableInput>;
export type CreateKeyDeliverableParsed = z.infer<typeof createKeyDeliverableInput>;

export const updateKeyDeliverableInput = z.object({
  ...deliverableFields,
  keyDeliverableId: itemId,
  rowVer: rowVerSchema,
});

export type UpdateKeyDeliverableInput = z.input<typeof updateKeyDeliverableInput>;
export type UpdateKeyDeliverableParsed = z.infer<typeof updateKeyDeliverableInput>;

export const deleteKeyDeliverableInput = z.object({
  keyDeliverableId: z.coerce.number().int().positive(),
  rowVer: rowVerSchema,
});

export type DeleteKeyDeliverableInput = z.input<typeof deleteKeyDeliverableInput>;

/** A bar's day: a real date between 1900 and 2200, at UTC midnight. */
const wbsDay = z.coerce
  .date()
  .refine((d) => {
    const year = d.getUTCFullYear();
    return !Number.isNaN(d.getTime()) && year >= 1900 && year <= 2200;
  }, messages.keyDeliverables.invalidDate)
  .transform(utcDay);

const endNotBeforeStart = {
  path: ["end"],
  message: messages.errors.dateOrder(
    messages.keyDeliverables.deadline,
    messages.keyDeliverables.startDate,
  ),
};

/** Work breakdown edits (ADR-0027): JSON from the editor, not FormData. */
export const addWbsItemInput = z
  .object({
    projectId: itemId,
    name: z.string().trim().min(1, messages.keyDeliverables.deliverableRequired).max(4000),
    parentId: itemId.nullable(),
    afterId: itemId.nullable(),
    start: wbsDay,
    end: wbsDay,
  })
  .refine((v) => v.end.getTime() >= v.start.getTime(), endNotBeforeStart);

export type AddWbsItemInput = z.input<typeof addWbsItemInput>;

export const moveWbsItemInput = z.object({
  id: itemId,
  parentId: itemId.nullable(),
  position: z.number().int().min(1).max(100_000),
  rowVer: rowVerSchema,
});

export type MoveWbsItemInput = z.input<typeof moveWbsItemInput>;

export const rescheduleWbsItemInput = z
  .object({ id: itemId, start: wbsDay, end: wbsDay, rowVer: rowVerSchema })
  .refine((v) => v.end.getTime() >= v.start.getTime(), endNotBeforeStart);

export type RescheduleWbsItemInput = z.input<typeof rescheduleWbsItemInput>;

export const renameWbsItemInput = z.object({
  id: itemId,
  name: z.string().trim().min(1, messages.keyDeliverables.deliverableRequired).max(4000),
  rowVer: rowVerSchema,
});

export type RenameWbsItemInput = z.input<typeof renameWbsItemInput>;

export const deleteWbsItemInput = z.object({ id: itemId, rowVer: rowVerSchema });

export type DeleteWbsItemInput = z.input<typeof deleteWbsItemInput>;

/** A status picked from the WBS or Gantt menu (ADR-0036); null clears it. The proc checks the list. */
export const setWbsStatusInput = z.object({
  id: itemId,
  status: z.string().trim().max(255).nullable(),
  rowVer: rowVerSchema,
});

export type SetWbsStatusInput = z.input<typeof setWbsStatusInput>;

const requirementText = z
  .string({ error: messages.keyDeliverables.requirementRequired })
  .trim()
  .min(1, messages.keyDeliverables.requirementRequired)
  .max(4000);

/** Requirements of a work breakdown item (migration 035, ADR-0036). */
export const addRequirementInput = z.object({ itemId, text: requirementText });

export type AddRequirementInput = z.input<typeof addRequirementInput>;

export const updateRequirementInput = z.object({
  id: itemId,
  text: requirementText,
  isMet: z.boolean(),
  rowVer: rowVerSchema,
});

export type UpdateRequirementInput = z.input<typeof updateRequirementInput>;

export const moveRequirementInput = z.object({
  id: itemId,
  position: z.number().int().min(1).max(100_000),
  rowVer: rowVerSchema,
});

export type MoveRequirementInput = z.input<typeof moveRequirementInput>;

export const deleteRequirementInput = z.object({ id: itemId, rowVer: rowVerSchema });

export type DeleteRequirementInput = z.input<typeof deleteRequirementInput>;

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
