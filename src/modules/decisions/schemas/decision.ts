import { z } from "zod";
import type { ListSort } from "@/lib/list-params";
import { actorAccessFields } from "@/lib/auth/actor-access";
import { listValue, type LookupListKey } from "@/lib/lookup-lists";
import { rowVerSchema } from "@/modules/projects/schemas/project";

/**
 * Decision log (app.Decision, migration 057) — zod contracts for the decisions
 * module (ADR-0055, BL36). Row schema mirrors the SELECT shape of
 * usp_Decision_{Create,GetById,List,Update} exactly.
 */

/** Dropdown lists the module reads (ADR-0022): both are editable from day one. */
export const DECISION_LISTS = [
  "decision.status",
  "decision.impacted-area",
] as const satisfies readonly LookupListKey[];

/** The most areas one decision may be tagged with (dbo.usp_Decision_ReplaceImpactedAreas). */
export const DECISION_AREAS_MAX = 50;

/** The most people one decision may record as consulted (dbo.usp_Decision_ReplaceStakeholders). */
export const DECISION_STAKEHOLDERS_MAX = 200;

/**
 * A set the procs return with FOR JSON PATH, which is NULL when the set is
 * empty. Both link tables travel on the decision's own row, so the form and the
 * register read one result set rather than fetching links per row.
 */
const jsonSet = <T, O>(element: z.ZodType<T>, pick: (row: T) => O) =>
  z
    .string()
    .nullable()
    .transform((json) => (json === null ? [] : z.array(element).parse(JSON.parse(json)).map(pick)));

export const decisionRowSchema = z.object({
  DecisionId: z.number().int(),
  ProjectId: z.number().int(),
  DecisionNumber: z.number().int(),
  Title: z.string(),
  DateLogged: z.date(),
  OwnerStakeholderId: z.number().int().nullable(),
  Status: z.string().nullable(),
  ProblemContext: z.string().nullable(),
  OptionsConsidered: z.string().nullable(),
  Rationale: z.string().nullable(),
  NextSteps: z.string().nullable(),
  SupersededByDecisionId: z.number().int().nullable(),
  ImpactedAreas: jsonSet(z.object({ label: z.string() }), (row) => row.label),
  ConsultedStakeholderIds: jsonSet(z.object({ id: z.number().int() }), (row) => row.id),
  CreatedAtUtc: z.date(),
  UpdatedAtUtc: z.date().nullable(),
  RowVer: rowVerSchema,
});

export type DecisionRow = z.infer<typeof decisionRowSchema>;

export const decisionListRowSchema = decisionRowSchema.extend({
  TotalCount: z.number().int(),
  ...actorAccessFields,
});

export type DecisionListRow = z.infer<typeof decisionListRowSchema>;

export const createDecisionInput = z.object({
  projectId: z.coerce.number().int().positive(),
  title: z.string().trim().min(1).max(255),
  dateLogged: z.coerce.date().nullish(),
  ownerStakeholderId: z.coerce.number().int().positive().nullish(),
  status: listValue.nullish(),
  problemContext: z.string().nullish(),
  optionsConsidered: z.string().nullish(),
  rationale: z.string().nullish(),
  nextSteps: z.string().nullish(),
  supersededByDecisionId: z.coerce.number().int().positive().nullish(),
  /** Null leaves the set as it stands; an array replaces it (the proc's Set flag). */
  impactedAreas: z.array(listValue.min(1)).max(DECISION_AREAS_MAX).nullish(),
  consultedStakeholderIds: z
    .array(z.coerce.number().int().positive())
    .max(DECISION_STAKEHOLDERS_MAX)
    .nullish(),
});

export type CreateDecisionInput = z.input<typeof createDecisionInput>;
export type CreateDecisionParsed = z.infer<typeof createDecisionInput>;

/** usp_Decision_Update takes no project: a decision never moves between projects. */
export const updateDecisionInput = createDecisionInput.omit({ projectId: true }).extend({
  decisionId: z.coerce.number().int().positive(),
  rowVer: rowVerSchema,
});

export type UpdateDecisionInput = z.input<typeof updateDecisionInput>;
export type UpdateDecisionParsed = z.infer<typeof updateDecisionInput>;

export const deleteDecisionInput = z.object({
  decisionId: z.coerce.number().int().positive(),
  rowVer: rowVerSchema,
});

export type DeleteDecisionInput = z.input<typeof deleteDecisionInput>;

/** Module filter params (URL ⇄ usp_Decision_List @ProjectId/@Status/@ImpactedArea). */
export const decisionFiltersSchema = z.object({
  project: z.coerce.number().int().positive().optional(),
  status: listValue.min(1).optional(),
  area: listValue.min(1).optional(),
});

export type DecisionFilters = z.infer<typeof decisionFiltersSchema>;

/** The orders usp_Decision_List applies (ADR-0016); newest first by default. */
export const DECISION_SORT: ListSort = {
  columns: ["DecisionNumber", "Title", "DateLogged", "Status"],
  default: null,
};
