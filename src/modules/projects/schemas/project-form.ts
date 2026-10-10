import { z } from "zod";
import { formText, type FormValues } from "@/components/ui/data-view/datasheet";
import { toDateInput } from "@/lib/format";
import { listChoice, type LookupListKey } from "@/lib/lookup-lists";
import { messages } from "@/lib/messages";
import type { ProjectRow } from "./project";

/**
 * Charter form contract ): ONE schema shared by the client form
 * (blur + submit validation over FormData strings) and the server action.
 * FormData values are strings — this schema coerces them into the repository
 * input shape (booleans for the MSSS flags, numbers for costs, Dates).
 */

/** Dropdown lists (checklist add-ons, requirements row 69; ADR-0022). */
export const PROJECT_LISTS = [
  "project.status",
  "project.priority",
  "project.phase",
  "project.risk-level",
] as const satisfies readonly LookupListKey[];

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null));

const memo = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : null));

/** Unchecked checkboxes are absent from FormData; checked submit "on". */
const flag = z.preprocess((v) => v === true || v === "on" || v === "true", z.boolean());

const money = z
  .string()
  .trim()
  .optional()
  .refine((v) => !v || !Number.isNaN(Number(v)), messages.projects.invalidNumber)
  .transform((v) => (v ? Number(v) : null));

const dateInput = z
  .string()
  .trim()
  .optional()
  .refine((v) => !v || !Number.isNaN(Date.parse(v)), messages.projects.invalidDate)
  .transform((v) => (v ? new Date(v) : null));

export const projectFormSchema = z.object({
  projectName: z.string().trim().min(1, messages.projects.nameRequired).max(255),
  projectManager: optionalText(255),
  businessAnalyst: optionalText(255),
  projectSponsor: optionalText(255),
  projectDocs: memo,
  dateOfProject: dateInput,
  problemStatement: memo,
  currentState: memo,
  futureState: memo,
  userImpact: memo,
  mandate: optionalText(255),
  projectStatusCom: memo,
  existBusMod: optionalText(255),
  a1: flag,
  da: flag,
  das: flag,
  purchaseOrder: flag,
  requisition: flag,
  do: flag,
  financingSource: optionalText(255),
  financingCost: money,
  recurrentCost: money,
  purchaseEquipment: flag,
  equipmentNotes: memo,
  startDate: dateInput,
  endDate: dateInput,
  similarProject: flag,
  /** Managed lists (ADR-0022): the proc checks these against the live options. */
  projectPriority: listChoice,
  estimatedCompletionDate: dateInput,
  projectStatus: listChoice,
  projectPhase: listChoice,
  riskLevel: listChoice,
});

export type ProjectFormValues = z.output<typeof projectFormSchema>;

export const updateProjectFormSchema = projectFormSchema.extend({
  projectId: z.coerce.number().int().positive(),
  rowVer: z.coerce.number().int().nonnegative(),
});

export type UpdateProjectFormValues = z.output<typeof updateProjectFormSchema>;

const flagValue = (value: boolean) => (value ? "on" : "");

/** A project as the charter form's values — what a datasheet cell edit sends (ADR-0023). */
export function projectFormValues(row: ProjectRow): FormValues {
  return {
    projectId: String(row.ProjectId),
    rowVer: String(row.RowVer),
    projectName: row.ProjectName,
    projectManager: formText(row.ProjectManager),
    businessAnalyst: formText(row.BusinessAnalyst),
    projectSponsor: formText(row.ProjectSponsor),
    projectDocs: formText(row.ProjectDocs),
    dateOfProject: toDateInput(row.DateOfProject),
    problemStatement: formText(row.ProblemStatement),
    currentState: formText(row.CurrentState),
    futureState: formText(row.FutureState),
    userImpact: formText(row.UserImpact),
    mandate: formText(row.Mandate),
    projectStatusCom: formText(row.ProjectStatusCom),
    existBusMod: formText(row.ExistBusMod),
    a1: flagValue(row.A1),
    da: flagValue(row.DA),
    das: flagValue(row.DAS),
    purchaseOrder: flagValue(row.PurchaseOrder),
    requisition: flagValue(row.Requisition),
    do: flagValue(row.DO),
    financingSource: formText(row.FinancingSource),
    financingCost: formText(row.FinancingCost),
    recurrentCost: formText(row.RecurrentCost),
    purchaseEquipment: flagValue(row.PurchaseEquipment),
    equipmentNotes: formText(row.EquipmentNotes),
    startDate: toDateInput(row.StartDate),
    endDate: toDateInput(row.EndDate),
    similarProject: flagValue(row.SimilarProject),
    projectPriority: formText(row.ProjectPriority),
    estimatedCompletionDate: toDateInput(row.EstimatedCompletionDate),
    projectStatus: formText(row.ProjectStatus),
    projectPhase: formText(row.ProjectPhase),
    riskLevel: formText(row.RiskLevel),
  };
}
