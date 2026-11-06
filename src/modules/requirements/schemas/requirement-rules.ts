import { messages } from "@/lib/messages";
import { isTest, sideOf, typeOrder, type RequirementType } from "./requirement-types";

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

/** A requirement's state from what validates it: a need's solutions, a solution's tests. */
export function coverageOf(validatedBy: readonly { isMet: boolean }[]): Coverage {
  const total = validatedBy.length;
  if (total === 0) return { kind: "none" };
  const met = validatedBy.filter((r) => r.isMet).length;
  return met === total ? { kind: "validated", total } : { kind: "partial", met, total };
}

/** A need reads as validated by its solutions, a solution as tested by its test cases. */
export function coverageLabel(coverage: Coverage, type: RequirementType): string {
  const M = messages.requirements;
  const solution = sideOf(type) === "solution";
  switch (coverage.kind) {
    case "none":
      return solution ? M.testCoverageNone : M.coverageNone;
    case "partial":
      return (solution ? M.testCoveragePartial : M.coveragePartial)(coverage.met, coverage.total);
    case "validated":
      return solution ? M.testCoverageDone : M.coverageDone;
  }
}

/** The coverage a requirement shows, or null for a test case, which nothing validates. */
export function coverageFor(
  type: RequirementType,
  validatedBy: readonly { isMet: boolean; status?: string }[],
): string | null {
  const active = validatedBy.filter((link) => link.status !== "Proposed");
  return isTest(type) ? null : coverageLabel(coverageOf(active), type);
}
