import { z } from "zod";
import type { FormValues } from "@/components/ui/data-view/datasheet";
import { messages } from "@/lib/messages";
import {
  MAX_REQUIREMENT_LENGTH,
  MAX_REQUIREMENT_LINKS,
  type RequirementListRow,
  type RequirementRow,
} from "./requirement";
import { isSolution, requirementTypeSchema } from "./requirement-types";

/**
 * One schema for the register's sheet, its datasheet cells and the server actions
 * (ADR-0023). Links and allocations change only when their "Set" flag is sent, so a
 * cell edit, which never sends them, leaves them alone.
 */

const M = messages.requirements;

/** Shared with the WBS cascade. */
export const requirementText = z
  .string({ error: M.requirementRequired })
  .trim()
  .min(1, M.requirementRequired)
  .max(MAX_REQUIREMENT_LENGTH);

/** A checkbox: "on" when checked, absent otherwise. */
const flag = z.preprocess(
  (v) => v === true || v === "on" || v === "true" || v === "1",
  z.boolean(),
);

const idEntry = z
  .string()
  .trim()
  .regex(/^[1-9]\d{0,9}$/, messages.errors.VALIDATION)
  .transform(Number)
  .refine((n) => n <= 2_147_483_647, messages.errors.VALIDATION);

/** Repeated "name[]" inputs: one string or several; duplicates dropped. */
const idList = z
  .union([idEntry, z.array(idEntry).max(MAX_REQUIREMENT_LINKS)])
  .optional()
  .transform((v) => [...new Set(v === undefined ? [] : Array.isArray(v) ? v : [v])]);

const requirementFields = z.object({
  requirementType: requirementTypeSchema,
  requirement: requirementText,
  isMet: flag,
  validatesSet: flag,
  "validatesIds[]": idList,
  deliverablesSet: flag,
  "deliverableIds[]": idList,
});

type Fields = z.output<typeof requirementFields>;

function toInput(raw: Fields) {
  return {
    type: raw.requirementType,
    text: raw.requirement,
    isMet: isSolution(raw.requirementType) && raw.isMet,
    validatesIds: raw.validatesSet ? raw["validatesIds[]"] : null,
    deliverableIds: raw.deliverablesSet ? raw["deliverableIds[]"] : null,
  };
}

/**
 * `parentRequirementId` makes the new row a sub-requirement of that one (ADR-0048). The type still
 * travels — the row the button sits on already knows it — but usp_Requirement_Create takes the
 * parent's own type regardless, so the two cannot disagree. Absent means a root requirement.
 */
export const createRequirementFormSchema = requirementFields
  .extend({
    projectId: z.coerce.number().int().positive(),
    parentRequirementId: idEntry.optional(),
  })
  .transform((raw) => ({
    projectId: raw.projectId,
    parentRequirementId: raw.parentRequirementId ?? null,
    ...toInput(raw),
  }));

export type CreateRequirementValues = z.output<typeof createRequirementFormSchema>;

export const updateRequirementFormSchema = requirementFields
  .extend({
    requirementId: z.coerce.number().int().positive(),
    rowVer: z.coerce.number().int().nonnegative(),
  })
  .transform((raw) => ({ requirementId: raw.requirementId, rowVer: raw.rowVer, ...toInput(raw) }));

export type UpdateRequirementValues = z.output<typeof updateRequirementFormSchema>;

/** A requirement as the update form's values — what a datasheet cell edit sends. */
export function requirementFormValues(row: RequirementRow | RequirementListRow): FormValues {
  return {
    requirementId: String(row.RequirementId),
    rowVer: String(row.RowVer),
    requirementType: row.RequirementType,
    requirement: row.Requirement,
    isMet: row.IsMet ? "on" : "",
  };
}

/** The merge link's ?validates=1,2,3; anything else is ignored. */
export function parseValidatesParam(raw: string | undefined): number[] {
  if (!raw || !/^\d+(,\d+)*$/.test(raw)) return [];
  const ids = raw
    .split(",")
    .map(Number)
    .filter((n) => n > 0 && n <= 2_147_483_647);
  return [...new Set(ids)].slice(0, MAX_REQUIREMENT_LINKS);
}
