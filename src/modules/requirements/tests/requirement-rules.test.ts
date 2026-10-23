import { describe, expect, it } from "vitest";
import {
  canMerge,
  compatibleTypes,
  coverageLabel,
  coverageOf,
  refList,
  requirementRef,
} from "../schemas/requirement-rules";
import {
  isNeed,
  isSolution,
  NEED_TYPES,
  REQUIREMENT_TYPES,
  SOLUTION_TYPES,
  solutionTypeSchema,
  typeLabel,
  type RequirementType,
} from "../schemas/requirement-types";

describe("requirement types", () => {
  it("splits the five types into needs and solutions", () => {
    expect(NEED_TYPES).toEqual(["BR", "SR"]);
    expect(SOLUTION_TYPES).toEqual(["FR", "NFR", "TR"]);
    for (const type of REQUIREMENT_TYPES) expect(isNeed(type)).toBe(!isSolution(type));
  });

  it.each(REQUIREMENT_TYPES)("%s has a label", (type) => {
    expect(typeLabel(type)).toMatch(/^[A-Z][a-z-]+$/);
  });

  it("takes only a solution where a deliverable is concerned, and knows no other code", () => {
    for (const type of SOLUTION_TYPES) {
      expect(solutionTypeSchema.safeParse(type).success).toBe(true);
    }
    for (const type of NEED_TYPES) {
      expect(solutionTypeSchema.safeParse(type).success).toBe(false);
    }
    // An unknown code belongs to neither side, so a cast cannot smuggle one in.
    expect(isNeed("XX")).toBe(false);
    expect(isSolution("XX")).toBe(false);
  });
});

describe("requirementRef and refList", () => {
  it("formats a reference", () => {
    expect(requirementRef("NFR", 12)).toBe("NFR-12");
  });

  it("lists references in catalog order, then by number", () => {
    expect(
      refList([
        { type: "TR", number: 1 },
        { type: "SR", number: 2 },
        { type: "BR", number: 10 },
        { type: "BR", number: 2 },
      ]),
    ).toBe("BR-2, BR-10, SR-2, TR-1");
    expect(refList([])).toBe("");
  });
});

describe("coverageOf", () => {
  it("is none without validating requirements", () => {
    expect(coverageOf([])).toEqual({ kind: "none" });
    expect(coverageLabel(coverageOf([]))).toBe("Not validated");
  });

  it("is partial while any is unmet", () => {
    const coverage = coverageOf([{ isMet: true }, { isMet: false }, { isMet: false }]);
    expect(coverage).toEqual({ kind: "partial", met: 1, total: 3 });
    expect(coverageLabel(coverage)).toBe("1 of 3 met");
    expect(coverageOf([{ isMet: false }])).toEqual({ kind: "partial", met: 0, total: 1 });
  });

  it("is validated when every one is met", () => {
    const coverage = coverageOf([{ isMet: true }, { isMet: true }]);
    expect(coverage).toEqual({ kind: "validated", total: 2 });
    expect(coverageLabel(coverage)).toBe("Validated");
  });
});

describe("compatibleTypes", () => {
  const free = { validates: 0, validatedBy: 0, allocations: 0 };

  it.each(REQUIREMENT_TYPES)("an unlinked %s may take any type", (type) => {
    expect(compatibleTypes({ type, ...free })).toEqual([...REQUIREMENT_TYPES]);
  });

  it.each<[RequirementType, Partial<typeof free>]>([
    ["FR", { validates: 1 }],
    ["NFR", { allocations: 1 }],
    ["TR", { validates: 3, allocations: 2 }],
  ])("a linked or allocated %s stays a solution", (type, links) => {
    expect(compatibleTypes({ type, ...free, ...links })).toEqual(["FR", "NFR", "TR"]);
  });

  it.each<RequirementType>(["BR", "SR"])("a validated %s stays a need", (type) => {
    expect(compatibleTypes({ type, ...free, validatedBy: 1 })).toEqual(["BR", "SR"]);
  });

  it("always offers the current type", () => {
    for (const type of REQUIREMENT_TYPES) {
      for (const links of [free, { ...free, validates: 1 }, { ...free, validatedBy: 1 }]) {
        expect(compatibleTypes({ type, ...links })).toContain(type);
      }
    }
  });
});

describe("canMerge", () => {
  it("needs at least one row, all of them needs", () => {
    expect(canMerge([])).toBe(false);
    expect(canMerge(["BR"])).toBe(true);
    expect(canMerge(["BR", "SR", "SR"])).toBe(true);
    expect(canMerge(["BR", "FR"])).toBe(false);
    expect(canMerge(["TR"])).toBe(false);
  });
});
