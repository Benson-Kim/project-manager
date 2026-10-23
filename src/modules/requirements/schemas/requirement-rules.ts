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

/** "FR-3". */
export function requirementRef(type: RequirementType, number: number): string {
  return `${type}-${number}`;
}

/** "BR-1, SR-2": catalog order, then number. */
export function refList(refs: readonly { type: RequirementType; number: number }[]): string {
  return [...refs]
    .sort((a, b) => typeOrder(a.type) - typeOrder(b.type) || a.number - b.number)
    .map((r) => requirementRef(r.type, r.number))
    .join(", ");
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
