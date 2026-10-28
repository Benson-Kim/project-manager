import { messages } from "@/lib/messages";
import {
  isNeed,
  isSolution,
  NEED_TYPES,
  REQUIREMENT_TYPES,
  SOLUTION_TYPES,
  typeOrder,
  type RequirementType,
} from "./requirement-types";

/**
 * A reference is the server's (ADR-0048). There is deliberately no requirementRef(type, number)
 * any more: once a requirement can sit under another one, its reference is the whole path
 * ("FR-1.1"), the register is paged, and a row's parent may not even have been sent — so nothing
 * here can compose one. Rows carry `Ref`, link entries carry `ref`, and both come from
 * ufn_Requirement_AncestorPath. Dropping the function rather than keeping a one-line wrapper is
 * what made the compiler point at all eight places that used to build a reference by hand.
 */

/** What refList needs of a link entry: enough to order it and to print it. */
export interface RefLike {
  type: RequirementType;
  ref: string;
  sortPath: string;
}

/**
 * "BR-1, BR-1.2, SR-2": catalog type order, then the padded path.
 * Compared with < and > rather than localeCompare: the paths are fixed-width digit groups, so a
 * plain code-unit comparison is exactly the server's ORDER BY, while locale collation may ignore
 * punctuation at primary strength and read "1.10" as "110".
 */
export function refList(refs: readonly RefLike[]): string {
  return [...refs]
    .sort(
      (a, b) =>
        typeOrder(a.type) - typeOrder(b.type) ||
        (a.sortPath < b.sortPath ? -1 : a.sortPath > b.sortPath ? 1 : 0),
    )
    .map((r) => r.ref)
    .join(", ");
}

/**
 * The reference of the requirement above this one, or null for a root: "FR-1.1.1" -> "FR-1.1".
 * A pure function of the ref the server already sent, so the sheet can name the parent without a
 * second column for it and without a second read — the path contains its own ancestry.
 */
export function parentRefOf(ref: string): string | null {
  const cut = ref.lastIndexOf(".");
  return cut === -1 ? null : ref.slice(0, cut);
}

export type Coverage =
  | { kind: "none" }
  | { kind: "partial"; met: number; total: number }
  | { kind: "validated"; total: number };

/** A need's state, from the solutions that validate it. */
export function coverageOf(validatedBy: readonly { isMet: boolean }[]): Coverage {
  const total = validatedBy.length;
  if (total === 0) return { kind: "none" };
  const met = validatedBy.filter((r) => r.isMet).length;
  return met === total ? { kind: "validated", total } : { kind: "partial", met, total };
}

export function coverageLabel(coverage: Coverage): string {
  const M = messages.requirements;
  switch (coverage.kind) {
    case "none":
      return M.coverageNone;
    case "partial":
      return M.coveragePartial(coverage.met, coverage.total);
    case "validated":
      return M.coverageDone;
  }
}

export interface TypeChangeContext {
  type: RequirementType;
  /** Needs this requirement validates. */
  validates: number;
  /** Solutions that validate this requirement. */
  validatedBy: number;
  /** Deliverables it is allocated to. */
  allocations: number;
}

/** The types a requirement may take without breaking its links or allocations (as usp_Requirement_Update). */
export function compatibleTypes(context: TypeChangeContext): RequirementType[] {
  if (isSolution(context.type) && (context.validates > 0 || context.allocations > 0)) {
    return [...SOLUTION_TYPES];
  }
  if (isNeed(context.type) && context.validatedBy > 0) return [...NEED_TYPES];
  return [...REQUIREMENT_TYPES];
}

/** Selected rows can be merged into a new solution when every one is a need. */
export function canMerge(types: readonly RequirementType[]): boolean {
  return types.length > 0 && types.every(isNeed);
}
