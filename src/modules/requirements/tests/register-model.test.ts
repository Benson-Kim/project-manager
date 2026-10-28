import { describe, expect, it } from "vitest";
import { messages } from "@/lib/messages";
import {
  canAddSubRequirement,
  coverageText,
  deleteBlockedReason,
  deleteConsequence,
  deliverablesText,
  mergeSelection,
  newRequirementType,
  parentText,
  pickedOptions,
  refCell,
  refsText,
  registerType,
  typeBlockedReason,
  typeCell,
  typeChangeContext,
  typeIsFree,
  type RegisterRow,
} from "../components/register-model";
import type { RequirementType } from "../schemas/requirement-types";

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

describe("typeChangeContext and typeIsFree", () => {
  it("counts the links and allocations a type change must keep valid", () => {
    expect(
      typeChangeContext(
        row({
          RequirementType: "FR",
          Validates: [link(2, "BR", "1")],
          DeliverableIds: [5, 6],
        }),
      ),
    ).toEqual({ type: "FR", validates: 1, validatedBy: 0, allocations: 2 });
  });

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

  it("leaves a solution without coverage of its own", () => {
    expect(
      coverageText(
        row({
          RequirementType: "FR",
          ValidatedBy: [solution(3, "FR", "1", true)],
        }),
      ),
    ).toBe(M.none);
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
  ];

  it("merges needs into a new functional requirement", () => {
    expect(mergeSelection(rows, [1, 2])).toEqual({ type: "FR", validates: "1,2" });
  });

  it("matches ids the DataView reports as strings", () => {
    expect(mergeSelection(rows, ["2"])).toEqual({ type: "FR", validates: "2" });
  });

  it("refuses a selection that is not all needs", () => {
    expect(mergeSelection(rows, [1, 3])).toBeNull();
    expect(mergeSelection(rows, [3])).toBeNull();
  });

  it("refuses an empty selection, or one holding a row of another page", () => {
    expect(mergeSelection(rows, [])).toBeNull();
    expect(mergeSelection(rows, [1, 99])).toBeNull();
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
  it("offers another level until the fourth", () => {
    expect(canAddSubRequirement(row({ Depth: 0 }))).toBe(true);
    expect(canAddSubRequirement(row({ Depth: 1 }))).toBe(true);
    expect(canAddSubRequirement(row({ Depth: 2 }))).toBe(true);
  });

  it("stops at the depth usp_Requirement_Create refuses, rather than letting the save fail", () => {
    expect(canAddSubRequirement(row({ Depth: 3 }))).toBe(false);
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
