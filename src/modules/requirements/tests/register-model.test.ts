import { describe, expect, it } from "vitest";
import { messages } from "@/lib/messages";
import {
  coverageText,
  deleteConsequence,
  deliverablesText,
  mergeSelection,
  newRequirementType,
  pickedOptions,
  refsText,
  registerType,
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
    Number: 1,
    Validates: [],
    ValidatedBy: [],
    DeliverableIds: [],
    ...overrides,
  };
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
          Validates: [{ id: 2, type: "BR", number: 1 }],
          DeliverableIds: [5, 6],
        }),
      ),
    ).toEqual({ type: "FR", validates: 1, validatedBy: 0, allocations: 2 });
  });

  it("frees only a row with no link either way and no allocation", () => {
    expect(typeIsFree(row())).toBe(true);
    expect(typeIsFree(row({ Validates: [{ id: 2, type: "BR", number: 1 }] }))).toBe(false);
    expect(typeIsFree(row({ ValidatedBy: [{ id: 3, type: "FR", number: 1, isMet: false }] }))).toBe(
      false,
    );
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
          ValidatedBy: [
            { id: 3, type: "FR", number: 1, isMet: true },
            { id: 4, type: "NFR", number: 1, isMet: false },
          ],
        }),
      ),
    ).toBe(M.coveragePartial(1, 2));
    expect(
      coverageText(
        row({
          RequirementType: "SR",
          ValidatedBy: [{ id: 3, type: "FR", number: 1, isMet: true }],
        }),
      ),
    ).toBe(M.coverageDone);
  });

  it("leaves a solution without coverage of its own", () => {
    expect(
      coverageText(
        row({
          RequirementType: "FR",
          ValidatedBy: [{ id: 3, type: "FR", number: 1, isMet: true }],
        }),
      ),
    ).toBe(M.none);
  });
});

describe("refsText", () => {
  it("lists references in catalog order", () => {
    expect(
      refsText([
        { type: "SR", number: 2 },
        { type: "BR", number: 7 },
        { type: "BR", number: 1 },
      ]),
    ).toBe("BR-1, BR-7, SR-2");
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
    row({ RequirementId: 1, RequirementType: "BR", Number: 1 }),
    row({ RequirementId: 2, RequirementType: "SR", Number: 1 }),
    row({ RequirementId: 3, RequirementType: "FR", Number: 1 }),
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
          Validates: [{ id: 2, type: "BR", number: 1 }],
          DeliverableIds: [5],
        }),
      ),
    ).toBe(`${M.deleteLeaves(1)} ${M.deleteUnlinks("BR-1")}`);
    expect(
      deleteConsequence(
        row({
          RequirementType: "BR",
          ValidatedBy: [{ id: 3, type: "FR", number: 2, isMet: true }],
        }),
      ),
    ).toBe(M.deleteUnlinks("FR-2"));
  });

  it("falls back to the register when nothing else is lost", () => {
    expect(deleteConsequence(row())).toBe(M.deleteBody);
  });
});
