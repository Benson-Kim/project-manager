import { z } from "zod";
import { messages } from "@/lib/messages";
import { rowVerSchema } from "@/modules/projects/schemas/project";
import { moscowSchema } from "./moscow";

/**
 * A requirement's planning fields (ADR-0052): MoSCoW, acceptance criteria, estimate and owner.
 * usp_Requirement_AssertPlanning holds the same limits; these are for the form's messages and to
 * keep a bad value off the wire. A blank form value is NULL, never 0 or "". An absent key is not
 * blank: the intention inputs refuse it, so a partial payload cannot clear a field.
 */

const M = messages.requirements;

export const MAX_CRITERIA_LENGTH = 4000;

/** DECIMAL(6, 1). */
export const MAX_ESTIMATE_DAYS = 99999.9;

const blankToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

const oneDecimal = (n: number) => Math.abs(n * 10 - Math.round(n * 10)) < 1e-9;

export const moscowField = z.preprocess(blankToNull, moscowSchema.nullable());

export const criteriaField = z.preprocess(
  blankToNull,
  z.string().trim().max(MAX_CRITERIA_LENGTH, M.criteriaTooLong).nullable(),
);

export const estimateField = z.preprocess(
  blankToNull,
  z.coerce
    .number({ error: M.estimateInvalid })
    .min(0, M.estimateInvalid)
    .max(MAX_ESTIMATE_DAYS, M.estimateInvalid)
    .refine(oneDecimal, M.estimateInvalid)
    .nullable(),
);

export const ownerField = z.preprocess(
  blankToNull,
  z.coerce.number().int().positive().max(2_147_483_647).nullable(),
);

const requirementId = z.coerce.number().int().positive();

/** One chip click. `moscow` must be sent: null clears it. */
export const setMoscowInput = z.object({
  requirementId,
  rowVer: rowVerSchema,
  moscow: moscowField,
});

export type SetMoscowInput = z.output<typeof setMoscowInput>;

/** All three together: an omitted one would otherwise clear silently. */
export const setPlanningInput = z.object({
  requirementId,
  rowVer: rowVerSchema,
  acceptanceCriteria: criteriaField,
  estimateDays: estimateField,
  ownerStakeholderId: ownerField,
});

export type SetPlanningInput = z.output<typeof setPlanningInput>;
