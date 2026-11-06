import { z } from "zod";
import { messages } from "@/lib/messages";

/**
 * The kinds of project requirement (ADR-0037), in three sides. What may link to what is data
 * (link-rules.ts, ADR-0060); solutions and tests carry the met tick, which for a test means it
 * passed. The SQL CHECKs list the same codes (src/tests/requirement-sql-guardrails.test.ts).
 */
export const NEED_TYPES = ["BR", "SR"] as const;

export const SOLUTION_TYPES = ["FR", "NFR", "TR"] as const;

export const TEST_TYPES = ["TC"] as const;

/** Catalog order: the needs, the solutions, then the tests. */
export const REQUIREMENT_TYPES = [...NEED_TYPES, ...SOLUTION_TYPES, ...TEST_TYPES] as const;

export type NeedType = (typeof NEED_TYPES)[number];

/** What the cascade's quick-add creates. A deliverable shows any kind the rules allow on it. */
export type SolutionType = (typeof SOLUTION_TYPES)[number];

export type TestType = (typeof TEST_TYPES)[number];

export type RequirementType = (typeof REQUIREMENT_TYPES)[number];

export type RequirementSide = "need" | "solution" | "test";

export const requirementTypeSchema = z.enum(REQUIREMENT_TYPES);

/** The kinds the cascade's quick-add accepts. */
export const solutionTypeSchema = z.enum(SOLUTION_TYPES);

export function sideOf(type: RequirementType): RequirementSide {
  if (isNeed(type)) return "need";
  return isSolution(type) ? "solution" : "test";
}

export function isNeed(type: string): type is NeedType {
  return (NEED_TYPES as readonly string[]).includes(type);
}

export function isSolution(type: string): type is SolutionType {
  return (SOLUTION_TYPES as readonly string[]).includes(type);
}

export function isTest(type: string): type is TestType {
  return (TEST_TYPES as readonly string[]).includes(type);
}

/** Whether the met tick applies: a solution is met, a test passed; a need has none of its own. */
export function canBeMet(type: RequirementType): boolean {
  return !isNeed(type);
}

export function typeLabel(type: RequirementType): string {
  return messages.requirements.types[type];
}

/** Catalog order: BR, SR, FR, NFR, TR, TC. */
export function typeOrder(type: RequirementType): number {
  return REQUIREMENT_TYPES.indexOf(type);
}
