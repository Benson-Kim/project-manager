import { describe, expect, it } from "vitest";
import { messages } from "@/lib/messages";
import {
  canAddSubRequirement,
  coverageText,
  deleteBlockedReason,
  deleteConsequence,
  deleteImpactText,
  deliverablesText,
  mergeSelection,
  newRequirementType,
  parentText,
  pickedOptions,
  promoteConsequence,
  refCell,
  refsText,
  registerType,
  typeBlockedReason,
  typeCell,
  typeIsFree,
  type RegisterRow,
} from "../components/register-model";
import { deleteRequirementInput, MAX_REQUIREMENT_DEPTH } from "../schemas/requirement";
import type { RequirementType } from "../schemas/requirement-types";
import { SEED_LINK_RULES } from "./seed-link-rules";

const M = messages.requirements;

function row(overrides: Partial<RegisterRow & { RequirementId: number }> = {}) {
  return {
    RequirementId: 1,
    RequirementType: "FR" as RequirementType,
    Ref: "FR-1",
    Depth: 0,
    ChildCount: 0,
    Validates: [],
    ValidatedBy: [],
    DeliverableIds: [],
    ...overrides,
  };
}

/**
 * A link entry as ufn_Requirement_Links sends it (ADR-0048): the whole path, plus the padded form
 * the server orders by. Built here the way the SQL builds it, so the sort these tests assert is
 * the sort the register actually gets.
 */
function link(id: number, type: RequirementType, path: string) {
  return {
    id,
    type,
    ref: `${type}-${path}`,
    sortPath: path
      .split(".")
      .map((segment) => segment.padStart(10, "0"))
      .join("."),
  };
}

function solution(id: number, type: RequirementType, path: string, isMet: boolean) {
  return { ...link(id, type, path), isMet };
}

const options = [
  { id: 5, label: "1 Discovery" },
  { id: 6, label: "1.2 Site survey" },
  { id: 7, label: "2 Rollout" },
];

describe("registerType", () => {
  it.each(["BR", "SR", "FR", "NFR", "TR"])("accepts the catalog code %s", (code) => {
    expect(registerType(code)).toBe(code);
  });

  it("ignores anything else", () => {
    expect(registerType(undefined)).toBeNull();
    expect(registerType("")).toBeNull();
    expect(registerType("fr")).toBeNull();
    expect(registerType("DROP TABLE app.Requirement")).toBeNull();
  });
});

describe("newRequirementType", () => {
  it("starts a new requirement with the filtered type", () => {
    expect(newRequirementType("NFR")).toBe("NFR");
  });

  it("falls back to a business requirement, so the new-entry row always has a type", () => {
    expect(newRequirementType(null)).toBe("BR");
  });
});

describe("typeIsFree", () => {
  it("frees only a row with no link either way and no allocation", () => {
    expect(typeIsFree(row())).toBe(true);
    expect(typeIsFree(row({ Validates: [link(2, "BR", "1")] }))).toBe(false);
    expect(typeIsFree(row({ ValidatedBy: [solution(3, "FR", "1", false)] }))).toBe(false);
    expect(typeIsFree(row({ DeliverableIds: [5] }))).toBe(false);
  });
});

describe("coverageText", () => {
  it("reads a need's state from the solutions that validate it", () => {
    expect(coverageText(row({ RequirementType: "BR" }))).toBe(M.coverageNone);
    expect(
      coverageText(
        row({
          RequirementType: "BR",
          ValidatedBy: [solution(3, "FR", "1", true), solution(4, "NFR", "1", false)],
        }),
      ),
    ).toBe(M.coveragePartial(1, 2));
    expect(
      coverageText(
        row({
          RequirementType: "SR",
          ValidatedBy: [solution(3, "FR", "1", true)],
        }),
      ),
    ).toBe(M.coverageDone);
  });

  it("reads a solution's state from the test cases that validate it", () => {
    expect(coverageText(row({ RequirementType: "FR" }))).toBe(M.testCoverageNone);
    expect(
      coverageText(
        row({
          RequirementType: "NFR",
          ValidatedBy: [solution(7, "TC", "1", true), solution(8, "TC", "2", false)],
        }),
      ),
    ).toBe(M.testCoveragePartial(1, 2));
    expect(
      coverageText(row({ RequirementType: "TR", ValidatedBy: [solution(7, "TC", "1", true)] })),
    ).toBe(M.testCoverageDone);
  });

  it("leaves a test case without coverage of its own", () => {
    expect(coverageText(row({ RequirementType: "TC" }))).toBe(M.none);
  });
});

describe("refsText", () => {
  it("lists references in catalog order", () => {
    expect(refsText([link(0, "SR", "2"), link(0, "BR", "7"), link(0, "BR", "1")])).toBe(
      "BR-1, BR-7, SR-2",
    );
  });

  it("reads None when there is nothing to list", () => {
    expect(refsText([])).toBe(M.none);
  });
});

describe("deliverablesText and pickedOptions", () => {
  it("names the allocations in option order", () => {
    expect(deliverablesText([7, 5], options)).toBe("1 Discovery, 2 Rollout");
    expect(pickedOptions([7, 5], options).map((o) => o.id)).toEqual([5, 7]);
  });

  it("leaves out an id the picker no longer offers", () => {
    expect(deliverablesText([6, 99], options)).toBe("1.2 Site survey");
    expect(pickedOptions([99], options)).toEqual([]);
  });

  it("reads None when nothing is allocated", () => {
    expect(deliverablesText([], options)).toBe(M.none);
  });
});

describe("mergeSelection", () => {
  const rows = [
    row({ RequirementId: 1, RequirementType: "BR", Ref: "BR-1" }),
    row({ RequirementId: 2, RequirementType: "SR", Ref: "SR-1" }),
    row({ RequirementId: 3, RequirementType: "FR", Ref: "FR-1" }),
    row({ RequirementId: 4, RequirementType: "NFR", Ref: "NFR-1" }),
    row({ RequirementId: 5, RequirementType: "TC", Ref: "TC-1" }),
  ];
  const merge = (ids: readonly (string | number)[]) => mergeSelection(rows, ids, SEED_LINK_RULES);

  it("merges needs into a new functional requirement", () => {
    expect(merge([1, 2])).toEqual({ type: "FR", validates: "1,2" });
  });

  it("matches ids the DataView reports as strings", () => {
    expect(merge(["2"])).toEqual({ type: "FR", validates: "2" });
  });

  it("turns solutions into a new test case that validates them", () => {
    expect(merge([3, 4])).toEqual({ type: "TC", validates: "3,4" });
  });

  it("takes a mixed selection below all of it", () => {
    expect(merge([1, 3])).toEqual({ type: "TC", validates: "1,3" });
  });

  it("refuses a selection holding a test case, which has nothing below it", () => {
    expect(merge([5])).toBeNull();
    expect(merge([3, 5])).toBeNull();
  });

  it("refuses when the rules leave no target", () => {
    expect(mergeSelection(rows, [1, 2], [])).toBeNull();
  });

  it("refuses an empty selection, or one holding a row of another page", () => {
    expect(merge([])).toBeNull();
    expect(merge([1, 99])).toBeNull();
  });
});

describe("deleteConsequence", () => {
  it("names the deliverables it leaves", () => {
    expect(deleteConsequence(row({ DeliverableIds: [5, 6] }))).toBe(M.deleteLeaves(2));
  });

  it("names the links that go with it, both directions", () => {
    expect(
      deleteConsequence(
        row({
          RequirementType: "FR",
          Validates: [link(2, "BR", "1")],
          DeliverableIds: [5],
        }),
      ),
    ).toBe(`${M.deleteLeaves(1)} ${M.deleteUnlinks("BR-1")}`);
    expect(
      deleteConsequence(
        row({
          RequirementType: "BR",
          ValidatedBy: [solution(3, "FR", "2", true)],
        }),
      ),
    ).toBe(M.deleteUnlinks("FR-2"));
  });

  it("falls back to the register when nothing else is lost", () => {
    expect(deleteConsequence(row())).toBe(M.deleteBody);
  });
});

describe("deleting a parent", () => {
  const impact = (ref: string, fate: "Deleted" | "Unlinked", id = 1) => ({
    RequirementId: id,
    RequirementType: "FR",
    Ref: ref,
    Fate: fate,
  });

  it("treats a row with only a downstream link as a parent", () => {
    const parent = row({ ValidatedBy: [solution(3, "FR", "1", false)] });
    expect(deleteBlockedReason(parent)).toBe(M.downstreamBlocksDelete(1));
  });

  it("lets a row with nothing under it go", () => {
    expect(deleteBlockedReason(row())).toBeNull();
  });

  it("says what is lost when there are no sub-requirements to move", () => {
    const parent = row({ DeliverableIds: [5], ValidatedBy: [solution(3, "FR", "1", false)] });
    expect(promoteConsequence(parent)).toBe(deleteConsequence(parent));
  });

  it("lists the deleted rows, then the rows that stay", () => {
    const text = deleteImpactText([impact("BR-1", "Deleted"), impact("FR-1", "Unlinked")]);
    expect(text).toBe(`${M.cascadeGoes("BR-1")} ${M.cascadeKeeps("FR-1")}`);
  });

  it("leaves the kept sentence out when nothing stays", () => {
    expect(deleteImpactText([impact("BR-1", "Deleted")])).toBe(M.cascadeGoes("BR-1"));
  });

  it("caps a long list and counts the rest", () => {
    const rows = Array.from({ length: 14 }, (_, i) => impact(`BR-${i + 1}`, "Deleted", i + 1));
    const shown = rows.slice(0, 12).map((r) => r.Ref);
    expect(deleteImpactText(rows)).toBe(M.cascadeGoes(`${shown.join(", ")} ${M.andMore(2)}`));
  });
});

describe("deleteRequirementInput", () => {
  const base = { requirementId: 7, rowVer: "1" };

  it("defaults to None, which the server refuses for a parent", () => {
    expect(deleteRequirementInput.parse(base).childAction).toBe("None");
  });

  it("takes only the three choices", () => {
    expect(deleteRequirementInput.safeParse({ ...base, childAction: "Delete" }).success).toBe(true);
    expect(deleteRequirementInput.safeParse({ ...base, childAction: "Sideways" }).success).toBe(
      false,
    );
  });

  it("takes a reviewed id set and refuses a non-positive id", () => {
    expect(deleteRequirementInput.safeParse({ ...base, expectedDeleteIds: [3, 4] }).success).toBe(
      true,
    );
    expect(deleteRequirementInput.safeParse({ ...base, expectedDeleteIds: [0] }).success).toBe(
      false,
    );
  });
});

/**
 * The tree, as the client's mock-up draws it (ADR-0048). Depth and Ref are the server's, so these
 * assert the rendering only — that a child is indented, marked, and labelled by its relationship
 * rather than by repeating its parent's type.
 */
describe("refCell", () => {
  it("leaves a root requirement's reference alone", () => {
    expect(refCell(row({ Ref: "FR-1", Depth: 0 }))).toBe("FR-1");
  });

  it("indents and marks a sub-requirement, one level at a time", () => {
    expect(refCell(row({ Ref: "FR-1.1", Depth: 1 }))).toBe("  ↳ FR-1.1");
    expect(refCell(row({ Ref: "FR-1.1.1", Depth: 2 }))).toBe("    ↳ FR-1.1.1");
  });
});

describe("typeCell", () => {
  it("names the type of a root requirement", () => {
    expect(typeCell(row({ RequirementType: "NFR", Depth: 0 }))).toBe(M.types.NFR);
  });

  it("names the relationship of a child, which carries its type in its reference", () => {
    expect(typeCell(row({ RequirementType: "FR", Ref: "FR-1.1", Depth: 1 }))).toBe(
      M.subRequirement,
    );
  });
});

describe("canAddSubRequirement", () => {
  it("offers another level well past the old four, up to the deepest", () => {
    expect(canAddSubRequirement(row({ Depth: 0 }))).toBe(true);
    expect(canAddSubRequirement(row({ Depth: 3 }))).toBe(true);
    expect(canAddSubRequirement(row({ Depth: MAX_REQUIREMENT_DEPTH - 2 }))).toBe(true);
  });

  it("stops at the depth usp_Requirement_Create refuses, rather than letting the save fail", () => {
    expect(canAddSubRequirement(row({ Depth: MAX_REQUIREMENT_DEPTH - 1 }))).toBe(false);
  });
});

describe("parentText", () => {
  it("names the requirement above a child, from its own path", () => {
    expect(parentText(row({ Ref: "FR-1.1", Depth: 1 }))).toBe(M.subRequirementOf("FR-1"));
    expect(parentText(row({ Ref: "FR-1.2.3", Depth: 2 }))).toBe(M.subRequirementOf("FR-1.2"));
  });

  it("says nothing for a root requirement", () => {
    expect(parentText(row({ Ref: "FR-1", Depth: 0 }))).toBeNull();
  });
});

describe("typeIsFree and typeBlockedReason with a tree", () => {
  it("pins a child's type to its parent's", () => {
    const child = row({ Ref: "FR-1.1", Depth: 1 });
    expect(typeIsFree(child)).toBe(false);
    expect(typeBlockedReason(child)).toBe(M.typeIsParents);
  });

  it("pins a parent's type while children carry its letters", () => {
    const parent = row({ ChildCount: 2 });
    expect(typeIsFree(parent)).toBe(false);
    expect(typeBlockedReason(parent)).toBe(M.subRequirementsBlockType(2));
  });

  it("leaves an unlinked, childless root free to change", () => {
    expect(typeIsFree(row())).toBe(true);
    expect(typeBlockedReason(row())).toBeNull();
  });
});

describe("deleteBlockedReason", () => {
  it("names the sub-requirements that have to go first, as the proc refuses", () => {
    expect(deleteBlockedReason(row({ ChildCount: 1 }))).toBe(M.subRequirementsBlockDelete(1));
    expect(deleteBlockedReason(row({ ChildCount: 3 }))).toBe(M.subRequirementsBlockDelete(3));
  });

  it("does not block a childless row", () => {
    expect(deleteBlockedReason(row())).toBeNull();
  });
});

describe("promoteConsequence", () => {
  it("says where the sub-requirements go and that their references change", () => {
    expect(promoteConsequence(row({ Ref: "FR-1.2", Depth: 1, ChildCount: 3 }))).toBe(
      M.promoteBody(3, "FR-1"),
    );
    expect(M.promoteBody(3, "FR-1")).toContain("under FR-1");
    expect(M.promoteBody(1, null)).toContain("to the top");
  });

  it("goes on to name what the parent itself loses", () => {
    expect(promoteConsequence(row({ Ref: "FR-1", ChildCount: 2, DeliverableIds: [5] }))).toBe(
      `${M.promoteBody(2, null)} ${M.deleteLeaves(1)}`,
    );
  });
});
