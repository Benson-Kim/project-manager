import { z } from "zod";
import { messages } from "@/lib/messages";

/**
 * Charter form contract (ADR-0009): ONE schema shared by the client form
 * (blur + submit validation over FormData strings) and the server action.
 * FormData values are strings — this schema coerces them into the repository
 * input shape (booleans for the MSSS flags, numbers for costs, Dates).
 */

/** Fixed UI vocabularies (checklist add-ons, requirements row 69). */
export const PROJECT_STATUSES = [
  "Not started",
  "In progress",
  "On hold",
  "Completed",
  "Cancelled",
] as const;
export const PROJECT_PRIORITIES = ["High", "Medium", "Low"] as const;
export const PROJECT_PHASES = [
  "Initiation",
  "Planning",
  "Execution",
  "Monitoring",
  "Closure",
] as const;
export const RISK_LEVELS = ["High", "Medium", "Low"] as const;

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
  projectPriority: optionalText(50),
  estimatedCompletionDate: dateInput,
  projectStatus: optionalText(50),
  projectPhase: optionalText(50),
  riskLevel: optionalText(50),
});

export type ProjectFormValues = z.output<typeof projectFormSchema>;

export const updateProjectFormSchema = projectFormSchema.extend({
  projectId: z.coerce.number().int().positive(),
  rowVer: z.coerce.number().int().nonnegative(),
});

export type UpdateProjectFormValues = z.output<typeof updateProjectFormSchema>;
