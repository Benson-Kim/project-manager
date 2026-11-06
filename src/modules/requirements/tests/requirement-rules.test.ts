import { describe, expect, it } from "vitest";
import {
  coverageFor,
  coverageLabel,
  coverageOf,
  parentRefOf,
  refList,
} from "../schemas/requirement-rules";
import {
  canBeMet,
  isNeed,
  isSolution,
  isTest,
  NEED_TYPES,
  REQUIREMENT_TYPES,
  sideOf,
  SOLUTION_TYPES,
  solutionTypeSchema,
  TEST_TYPES,
  typeLabel,
  type RequirementType,
} from "../schemas/requirement-types";

/** A link entry as the server sends it: the printed path plus the padded one it orders by. */
function link(type: RequirementType, path: string) {
  return {
    type,
    ref: `${type}-${path}`,
    sortPath: path
      .split(".")
      .map((segment) => segment.padStart(10, "0"))
      .join("."),
  };
}

describe("requirement types", () => {
  it("splits the six types into needs, solutions and test cases, each on one side", () => {
    expect(NEED_TYPES).toEqual(["BR", "SR"]);
    expect(SOLUTION_TYPES).toEqual(["FR", "NFR", "TR"]);
    expect(TEST_TYPES).toEqual(["TC"]);
    for (const type of REQUIREMENT_TYPES) {
      expect([isNeed(type), isSolution(type), isTest(type)].filter(Boolean)).toHaveLength(1);
    }
  });

  it("ticks solutions (met) and test cases (passed), never needs", () => {
    expect(REQUIREMENT_TYPES.filter(canBeMet)).toEqual(["FR", "NFR", "TR", "TC"]);
    expect(sideOf("TC")).toBe("test");
  });

  it.each(REQUIREMENT_TYPES)("%s has a label", (type) => {
    expect(typeLabel(type)).toMatch(/^[A-Z][a-z -]+$/);
  });

  it("takes only a solution where a deliverable is concerned, and knows no other code", () => {
    for (const type of SOLUTION_TYPES) {
      expect(solutionTypeSchema.safeParse(type).success).toBe(true);
    }
    for (const type of [...NEED_TYPES, ...TEST_TYPES]) {
      expect(solutionTypeSchema.safeParse(type).success).toBe(false);
    }
    // An unknown code belongs to neither side, so a cast cannot smuggle one in.
    expect(isNeed("XX")).toBe(false);
    expect(isSolution("XX")).toBe(false);
    expect(isTest("XX")).toBe(false);
  });
});

/**
 * refList and parentRefOf (ADR-0048). There is no requirementRef any more: a reference is the
 * server's whole path, so nothing composes one from a type and a number.
 */
describe("refList", () => {
  it("lists references in catalog order, then by the padded path", () => {
    expect(refList([link("TR", "1"), link("SR", "2"), link("BR", "10"), link("BR", "2")])).toBe(
      "BR-2, BR-10, SR-2, TR-1",
    );
    expect(refList([])).toBe("");
  });

  it("keeps a sub-requirement under its parent, and 1.2 before 1.10", () => {
    expect(refList([link("BR", "1.10"), link("BR", "2"), link("BR", "1.2"), link("BR", "1")])).toBe(
      "BR-1, BR-1.2, BR-1.10, BR-2",
    );
  });

  it("orders by the padded path and not by the printed one, which would read 1.10 first", () => {
    const refs = [link("FR", "1.10"), link("FR", "1.2")];
    expect(refList(refs)).toBe("FR-1.2, FR-1.10");
    expect([...refs].sort((a, b) => a.ref.localeCompare(b.ref)).map((r) => r.ref)).toEqual([
      "FR-1.10",
      "FR-1.2",
    ]);
  });
});

describe("parentRefOf", () => {
  it("drops the last segment of a path", () => {
    expect(parentRefOf("FR-1.1")).toBe("FR-1");
    expect(parentRefOf("FR-1.2.3")).toBe("FR-1.2");
  });

  it("has nothing above a root requirement", () => {
    expect(parentRefOf("FR-1")).toBeNull();
    expect(parentRefOf("NFR-12")).toBeNull();
  });
});

describe("coverageOf", () => {
  it("is none without validating requirements", () => {
    expect(coverageOf([])).toEqual({ kind: "none" });
    expect(coverageLabel(coverageOf([]), "BR")).toBe("Not validated");
    expect(coverageLabel(coverageOf([]), "FR")).toBe("Not tested");
  });

  it("is partial while any is unmet", () => {
    const coverage = coverageOf([{ isMet: true }, { isMet: false }, { isMet: false }]);
    expect(coverage).toEqual({ kind: "partial", met: 1, total: 3 });
    expect(coverageLabel(coverage, "SR")).toBe("1 of 3 met");
    expect(coverageLabel(coverage, "NFR")).toBe("1 of 3 passed");
    expect(coverageOf([{ isMet: false }])).toEqual({ kind: "partial", met: 0, total: 1 });
  });

  it("is validated when every one is met", () => {
    const coverage = coverageOf([{ isMet: true }, { isMet: true }]);
    expect(coverage).toEqual({ kind: "validated", total: 2 });
    expect(coverageLabel(coverage, "BR")).toBe("Validated");
    expect(coverageLabel(coverage, "TR")).toBe("All tests passed");
  });

  it("gives a test case no coverage, since nothing validates it", () => {
    expect(coverageFor("TC", [])).toBeNull();
    expect(coverageFor("FR", [{ isMet: true, status: "Proposed" }])).toBe(coverageFor("FR", []));
    expect(coverageFor("FR", [{ isMet: true }])).toBe("All tests passed");
  });
});
