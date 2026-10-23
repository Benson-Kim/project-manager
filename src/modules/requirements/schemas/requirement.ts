import { z } from "zod";
import type { ListSort } from "@/lib/list-params";
import { actorAccessFields } from "@/lib/auth/actor-access";
import { rowVerSchema } from "@/modules/projects/schemas/project";
import { requirementTypeSchema, type RequirementType } from "./requirement-types";

/**
 * Project requirements (ADR-0037) — zod contracts for the rows of
 * usp_Requirement_{List,GetById,Create,Update} and usp_Requirement_Options.
 */

export const MAX_REQUIREMENT_LENGTH = 4000;

/** Links or allocations one save may set; usp_Requirement_Replace* refuse more. */
export const MAX_REQUIREMENT_LINKS = 200;

export interface RequirementRef {
  id: number;
  type: RequirementType;
  number: number;
}

export interface SolutionRef extends RequirementRef {
  isMet: boolean;
}

const bit = z.union([z.boolean(), z.literal(0), z.literal(1)]).transform(Boolean);

const refEntry = z.object({
  id: z.number().int().positive(),
  type: requirementTypeSchema,
  number: z.number().int().positive(),
});

const solutionRefEntry = refEntry.extend({ isMet: bit });

const deliverableEntry = z.object({ id: z.number().int().positive() });

/** A FOR JSON column: NULL is []; malformed JSON throws. */
function jsonArray<T extends z.ZodType>(item: T) {
  return z.preprocess(
    (raw) => (raw === null || raw === undefined || raw === "" ? [] : JSON.parse(String(raw))),
    z.array(item),
  );
}

const requirementColumns = z.object({
  RequirementId: z.number().int(),
  ProjectId: z.number().int(),
  RequirementType: requirementTypeSchema,
  Number: z.number().int(),
  Requirement: z.string(),
  IsMet: bit,
  CreatedAtUtc: z.date(),
  UpdatedAtUtc: z.date().nullable(),
  RowVer: rowVerSchema,
  ValidatesJson: jsonArray(refEntry),
  ValidatedByJson: jsonArray(solutionRefEntry),
  DeliverablesJson: jsonArray(deliverableEntry),
});

function withLinks<T extends z.output<typeof requirementColumns>>(row: T) {
  const { ValidatesJson, ValidatedByJson, DeliverablesJson, ...rest } = row;
  return {
    ...rest,
    Validates: ValidatesJson as RequirementRef[],
    ValidatedBy: ValidatedByJson as SolutionRef[],
    DeliverableIds: DeliverablesJson.map((d) => d.id),
  };
}

export const requirementRowSchema = requirementColumns.transform(withLinks);

export type RequirementRow = z.output<typeof requirementRowSchema>;

export const requirementListRowSchema = requirementColumns
  .extend({ TotalCount: z.number().int(), ...actorAccessFields })
  .transform(withLinks);

export type RequirementListRow = z.output<typeof requirementListRowSchema>;

/** A need offered by the link picker. */
export const requirementOptionSchema = z
  .object({
    RequirementId: z.number().int().positive(),
    RequirementType: requirementTypeSchema,
    Number: z.number().int().positive(),
    Requirement: z.string(),
  })
  .transform((r) => ({
    id: r.RequirementId,
    type: r.RequirementType,
    number: r.Number,
    text: r.Requirement,
  }));

export type RequirementOption = z.output<typeof requirementOptionSchema>;

export const deleteRequirementInput = z.object({
  requirementId: z.coerce.number().int().positive(),
  rowVer: rowVerSchema,
});

export type DeleteRequirementInput = z.output<typeof deleteRequirementInput>;

/**
 * The orders usp_Requirement_List applies (ADR-0016). Null default: the proc's
 * own is the catalog type order then the number (BR-1, SR-1, FR-1 ...), which no
 * single column reproduces, so Ref carries no control.
 */
export const REQUIREMENT_SORT: ListSort = {
  columns: ["Requirement", "CreatedAtUtc"],
  default: null,
};
