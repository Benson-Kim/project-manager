import { z } from "zod";
import { formText, type FormValues } from "@/components/ui/data-view/datasheet";
import { datesInOrder, datesWere, storedDates } from "@/lib/date-range";
import { toDateInput } from "@/lib/format";
import { listChoice } from "@/lib/lookup-lists";
import { messages } from "@/lib/messages";
import { richTextSchema, RICH_TEXT_FIELD_MAX } from "@/lib/rich-text/schema";
import type { RiskIssueRow } from "./risk-issue";

/**
 * RiskIssue form contract (#14) — ONE schema shared by the client Sheet form
 * (blur + submit validation over FormData strings) and the server actions.
 * FormData values are strings — "" → null for optional fields.
 *
 * Description and MitigationPlan take formatting (ADR-0025): the migrated
 * records carry HTML in both.
 * The five list fields are managed lists (ADR-0022): "" → null here, and the
 * procs check the value against the live list, so a forged payload still
 * cannot persist an unrecognised value.
 */

const dateInput = z
  .string()
  .trim()
  .optional()
  .refine((v) => !v || !Number.isNaN(Date.parse(v)), messages.risksIssues.invalidDate)
  .transform((v) => (v ? new Date(v) : null));

const riskIssueFields = z.object({
  projectId: z.coerce.number().int().positive(),
  description: richTextSchema({
    max: RICH_TEXT_FIELD_MAX,
    required: messages.risksIssues.descriptionRequired,
  }),
  category: listChoice,
  dateIdentified: dateInput,
  status: listChoice,
  priority: listChoice,
  impact: listChoice,
  probability: listChoice,
  mitigationPlan: richTextSchema({ max: RICH_TEXT_FIELD_MAX }),
  owner: z
    .string()
    .trim()
    .max(255)
    .optional()
    .transform((v) => (v ? v : null)),
  dueDate: dateInput,
});

/** A record is raised before it falls due, so the due date may not precede the date identified. */
const riskIssueDates = datesInOrder({
  start: "dateIdentified",
  end: "dueDate",
  message: messages.errors.dateOrder(
    messages.risksIssues.dueDate,
    messages.risksIssues.dateIdentified,
  ),
});

export const riskIssueFormSchema = riskIssueFields.superRefine(riskIssueDates);

export type RiskIssueFormValues = z.output<typeof riskIssueFormSchema>;

export const updateRiskIssueFormSchema = riskIssueFields
  .extend({
    riskIssueId: z.coerce.number().int().positive(),
    rowVer: z.coerce.number().int().nonnegative(),
    ...datesWere("dateIdentified", "dueDate"),
  })
  .superRefine(riskIssueDates);

export type UpdateRiskIssueFormValues = z.output<typeof updateRiskIssueFormSchema>;

/** A record as the update form's values — what a datasheet cell edit sends (ADR-0023). */
export function riskIssueFormValues(row: RiskIssueRow): FormValues {
  return {
    riskIssueId: String(row.RiskIssueId),
    rowVer: String(row.RowVer),
    projectId: String(row.ProjectId),
    description: formText(row.Description),
    category: formText(row.Category),
    dateIdentified: toDateInput(row.DateIdentified),
    status: formText(row.Status),
    priority: formText(row.Priority),
    impact: formText(row.Impact),
    probability: formText(row.Probability),
    mitigationPlan: formText(row.MitigationPlan),
    owner: formText(row.Owner),
    dueDate: toDateInput(row.DueDate),
    ...storedDates({ dateIdentified: row.DateIdentified, dueDate: row.DueDate }),
  };
}
