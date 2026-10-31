import { z } from "zod";
import type { ListSort } from "@/lib/list-params";
import { actorAccessFields } from "@/lib/auth/actor-access";
import { rowVerSchema } from "@/modules/projects/schemas/project";
import { moscowSchema } from "./moscow";
import { requirementTypeSchema, type RequirementType } from "./requirement-types";

/**
 * Project requirements (ADR-0037) — zod contracts for the rows of
 * usp_Requirement_{List,GetById,Create,Update} and usp_Requirement_Options.
 */

export const MAX_REQUIREMENT_LENGTH = 4000;

/**
 * How deep sub-requirements go, FR-1 through FR-1.1.1.1 (ADR-0048). usp_Requirement_Create refuses
 * a fifth level under the project lock; this is the same number for the UI, which stops offering
 * "Add sub-requirement" on the deepest row rather than letting the save fail. The client wrote
 * "normally this does not going for long", so four is a limit they can ask to raise, not a guess
 * at what they need.
 */
export const MAX_REQUIREMENT_DEPTH = 4;

/** Links or allocations one save may set; usp_Requirement_Replace* refuse more. */
export const MAX_REQUIREMENT_LINKS = 200;

export interface RequirementRef {
  id: number;
  type: RequirementType;
  /** "FR-1.1" — the whole path, as the server built it (ADR-0048). Never composed here. */
  ref: string;
  /** Zero-padded path, the only thing that orders refs correctly ('1.10' sorts before '1.2'). */
  sortPath: string;
}

export interface SolutionRef extends RequirementRef {
  isMet: boolean;
}

const bit = z.union([z.boolean(), z.literal(0), z.literal(1)]).transform(Boolean);

const refEntry = z.object({
  id: z.number().int().positive(),
  type: requirementTypeSchema,
  ref: z.string().min(1),
  sortPath: z.string().min(1),
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
  /** The number under this requirement's parent, which on its own no longer names it. */
  Number: z.number().int(),
  /** ufn_Requirement_AncestorPath: "FR-1.1" for display, SortPath to order by, Depth to indent by. */
  Ref: z.string().min(1),
  SortPath: z.string().min(1),
  Depth: z.number().int().nonnegative(),
  /** Live sub-requirements directly under this row: what a type change or a delete would hit. */
  ChildCount: z.number().int().nonnegative(),
  ParentRequirementId: z.number().int().nullable(),
  /** Planning (ADR-0052). NULL MoSCoW is "not prioritised yet"; OwnerName is NULL once deleted. */
  MoSCoW: moscowSchema.nullable(),
  AcceptanceCriteria: z.string().nullable(),
  EstimateDays: z.number().nonnegative().nullable(),
  OwnerStakeholderId: z.number().int().nullable(),
  OwnerName: z.string().nullable(),
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
    Ref: z.string().min(1),
    Requirement: z.string(),
  })
  .transform((r) => ({
    id: r.RequirementId,
    type: r.RequirementType,
    ref: r.Ref,
    text: r.Requirement,
  }));

export type RequirementOption = z.output<typeof requirementOptionSchema>;

export const deleteRequirementInput = z.object({
  requirementId: z.coerce.number().int().positive(),
  rowVer: rowVerSchema,
});

export type DeleteRequirementInput = z.output<typeof deleteRequirementInput>;

/**
 * The orders usp_Requirement_List applies (ADR-0016). Null default: the proc's own is the catalog
 * type order then the tree path (BR-1, BR-1.1, SR-1, FR-1 ...), which no single column reproduces
 * — less than ever now that the second half of it is a recursive path (ADR-0048) — so Ref still
 * carries no control.
 */
export const REQUIREMENT_SORT: ListSort = {
  columns: ["Requirement", "CreatedAtUtc"],
  default: null,
};
