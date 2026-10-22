import { z } from "zod";
import { messages } from "@/lib/messages";

/**
 * The five kinds of project requirement (ADR-0037). Needs are validated by solutions;
 * only solutions go to deliverables and carry a met tick. The SQL CHECKs list the same
 * codes (src/tests/requirement-sql-guardrails.test.ts).
 */
export const REQUIREMENT_TYPES = ["BR", "SR", "FR", "NFR", "TR"] as const;

export type RequirementType = (typeof REQUIREMENT_TYPES)[number];

export type RequirementSide = "need" | "solution";

const SIDES: Record<RequirementType, RequirementSide> = {
  BR: "need",
  SR: "need",
  FR: "solution",
  NFR: "solution",
  TR: "solution",
};

export const NEED_TYPES: readonly RequirementType[] = REQUIREMENT_TYPES.filter(
  (type) => SIDES[type] === "need",
);

export const SOLUTION_TYPES: readonly RequirementType[] = REQUIREMENT_TYPES.filter(
  (type) => SIDES[type] === "solution",
);

export const requirementTypeSchema = z.enum(REQUIREMENT_TYPES);

export function sideOf(type: RequirementType): RequirementSide {
  return SIDES[type];
}

export function isNeed(type: RequirementType): boolean {
  return SIDES[type] === "need";
}

export function isSolution(type: RequirementType): boolean {
  return SIDES[type] === "solution";
}

export function typeLabel(type: RequirementType): string {
  return messages.requirements.types[type];
}

/** Catalog order: BR, SR, FR, NFR, TR. */
export function typeOrder(type: RequirementType): number {
  return REQUIREMENT_TYPES.indexOf(type);
}
