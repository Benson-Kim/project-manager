import { z } from "zod";
import { formText, type FormValues } from "@/components/ui/data-view/datasheet";
import { toDateInput } from "@/lib/format";
import { listChoice, listChoiceSet } from "@/lib/lookup-lists";
import { messages } from "@/lib/messages";
import { richTextSchema, RICH_TEXT_FIELD_MAX } from "@/lib/rich-text/schema";
import { DECISION_STAKEHOLDERS_MAX, type DecisionRow } from "./decision";

/**
 * Decision form contract (ADR-0055) — ONE schema shared by the client Sheet
 * form and the server actions, over the strings FormData carries.
 *
 * The two sets travel with their own "set" flag, so a datasheet cell edit,
 * which never sends them, leaves the impacted areas and the consulted people
 * alone (the @ImpactedAreasSet / @StakeholderIdsSet pair). The narrative fields
 * take formatting (ADR-0025); Status is a managed list, so "" reaches the proc
 * as null and anything else is checked against the live list in-proc.
 */

const M = messages.decisions;

/** An absent field and a cleared one both mean "no row picked". */
const blankToNull = (v: unknown) =>
  v === undefined || (typeof v === "string" && v.trim() === "") ? null : v;

/** A hidden flag or checkbox: present and truthy means the set travels. */
const flag = z.preprocess(
  (v) => v === true || v === "on" || v === "true" || v === "1",
  z.boolean(),
);

const dateInput = z
  .string()
  .trim()
  .optional()
  .refine((v) => !v || !Number.isNaN(Date.parse(v)), M.invalidDate)
  .transform((v) => (v ? new Date(v) : null));

/** A row this decision points at; "" clears it. */
const idField = z.preprocess(
  blankToNull,
  z.coerce.number().int().positive().max(2_147_483_647).nullable(),
);

const idEntry = z
  .string()
  .trim()
  .regex(/^[1-9]\d{0,9}$/, messages.errors.VALIDATION)
  .transform(Number)
  .refine((n) => n <= 2_147_483_647, messages.errors.VALIDATION);

/** Repeated "name[]" inputs: one string or several; duplicates dropped. */
const idList = z
  .union([idEntry, z.array(idEntry).max(DECISION_STAKEHOLDERS_MAX)])
  .optional()
  .transform((v) => [...new Set(v === undefined ? [] : Array.isArray(v) ? v : [v])]);

const decisionFields = z.object({
  title: z.string({ error: M.titleRequired }).trim().min(1, M.titleRequired).max(255),
  dateLogged: dateInput,
  ownerStakeholderId: idField,
  status: listChoice,
  problemContext: richTextSchema({ max: RICH_TEXT_FIELD_MAX }),
  optionsConsidered: richTextSchema({ max: RICH_TEXT_FIELD_MAX }),
  rationale: richTextSchema({ max: RICH_TEXT_FIELD_MAX }),
  nextSteps: richTextSchema({ max: RICH_TEXT_FIELD_MAX }),
  supersededByDecisionId: idField,
  impactedAreasSet: flag,
  "impactedAreas[]": listChoiceSet,
  stakeholdersSet: flag,
  "consultedStakeholderIds[]": idList,
});

type Fields = z.output<typeof decisionFields>;

function toInput(raw: Fields) {
  return {
    title: raw.title,
    dateLogged: raw.dateLogged,
    ownerStakeholderId: raw.ownerStakeholderId,
    status: raw.status,
    problemContext: raw.problemContext,
    optionsConsidered: raw.optionsConsidered,
    rationale: raw.rationale,
    nextSteps: raw.nextSteps,
    supersededByDecisionId: raw.supersededByDecisionId,
    impactedAreas: raw.impactedAreasSet ? raw["impactedAreas[]"] : null,
    consultedStakeholderIds: raw.stakeholdersSet ? raw["consultedStakeholderIds[]"] : null,
  };
}

export const createDecisionFormSchema = decisionFields
  .extend({ projectId: z.coerce.number().int().positive() })
  .transform((raw) => ({ projectId: raw.projectId, ...toInput(raw) }));

export type CreateDecisionValues = z.output<typeof createDecisionFormSchema>;

export const updateDecisionFormSchema = decisionFields
  .extend({
    decisionId: z.coerce.number().int().positive(),
    rowVer: z.coerce.number().int().nonnegative(),
  })
  .transform((raw) => ({ decisionId: raw.decisionId, rowVer: raw.rowVer, ...toInput(raw) }));

export type UpdateDecisionValues = z.output<typeof updateDecisionFormSchema>;

/**
 * A decision as the update form's values — what a datasheet cell edit sends
 * (ADR-0023). Neither set flag is here, so a cell edit keeps both link tables.
 */
export function decisionFormValues(row: DecisionRow): FormValues {
  return {
    decisionId: String(row.DecisionId),
    rowVer: String(row.RowVer),
    title: row.Title,
    dateLogged: toDateInput(row.DateLogged),
    ownerStakeholderId: formText(row.OwnerStakeholderId),
    status: formText(row.Status),
    problemContext: formText(row.ProblemContext),
    optionsConsidered: formText(row.OptionsConsidered),
    rationale: formText(row.Rationale),
    nextSteps: formText(row.NextSteps),
    supersededByDecisionId: formText(row.SupersededByDecisionId),
  };
}
