import { z } from "zod";
import { messages } from "@/lib/messages";

/**
 * The five kinds of project requirement (ADR-0037). Needs are validated by solutions;
 * only solutions go to deliverables and carry a met tick. The SQL CHECKs list the same
 * codes (src/tests/requirement-sql-guardrails.test.ts).
 */
export const NEED_TYPES = ["BR", "SR"] as const;

export const SOLUTION_TYPES = ["FR", "NFR", "TR"] as const;

/** Catalog order: the needs, then the solutions. */
export const REQUIREMENT_TYPES = [...NEED_TYPES, ...SOLUTION_TYPES] as const;

export type NeedType = (typeof NEED_TYPES)[number];

/** What a deliverable can carry: the cascade handles these and no other kind. */
export type SolutionType = (typeof SOLUTION_TYPES)[number];

export type RequirementType = (typeof REQUIREMENT_TYPES)[number];

export type RequirementSide = "need" | "solution";

export const requirementTypeSchema = z.enum(REQUIREMENT_TYPES);

/** An allocated requirement is always a solution, so the cascade reads and writes this. */
export const solutionTypeSchema = z.enum(SOLUTION_TYPES);

export function sideOf(type: RequirementType): RequirementSide {
  return isNeed(type) ? "need" : "solution";
}

export function isNeed(type: string): type is NeedType {
  return (NEED_TYPES as readonly string[]).includes(type);
}

export function isSolution(type: string): type is SolutionType {
  return (SOLUTION_TYPES as readonly string[]).includes(type);
}

export function typeLabel(type: RequirementType): string {
  return messages.requirements.types[type];
}

/** Catalog order: BR, SR, FR, NFR, TR. */
export function typeOrder(type: RequirementType): number {
  return REQUIREMENT_TYPES.indexOf(type);
}
