import { describe, expect, it } from "vitest";
import {
  requirementListRowSchema,
  requirementOptionSchema,
  requirementRowSchema,
} from "../schemas/requirement";
import {
  createRequirementFormSchema,
  parseValidatesParam,
  requirementFormValues,
  updateRequirementFormSchema,
} from "../schemas/requirement-form";

const dbRow = {
  RequirementId: 7,
  ProjectId: 2,
  RequirementType: "FR",
  Number: 3,
  Requirement: "Export the register",
  IsMet: true,
  CreatedAtUtc: new Date("2026-10-21T08:00:00Z"),
  UpdatedAtUtc: null,
  RowVer: "2001",
  ValidatesJson: '[{"id":1,"type":"BR","number":1},{"id":4,"type":"SR","number":2}]',
  ValidatedByJson: null,
  DeliverablesJson: '[{"id":11},{"id":12}]',
};

describe("requirementRowSchema", () => {
  it("parses the JSON columns into links and allocation ids", () => {
    const row = requirementRowSchema.parse(dbRow);
    expect(row.Validates).toEqual([
      { id: 1, type: "BR", number: 1 },
      { id: 4, type: "SR", number: 2 },
    ]);
    expect(row.ValidatedBy).toEqual([]);
    expect(row.DeliverableIds).toEqual([11, 12]);
    expect(row.RowVer).toBe(2001);
    expect(row).not.toHaveProperty("ValidatesJson");
  });

  it("reads met flags in validating links as booleans", () => {
    const row = requirementRowSchema.parse({
      ...dbRow,
      RequirementType: "BR",
      IsMet: false,
      ValidatesJson: null,
      ValidatedByJson:
        '[{"id":7,"type":"FR","number":3,"isMet":1},{"id":8,"type":"TR","number":1,"isMet":false}]',
      DeliverablesJson: null,
    });
    expect(row.ValidatedBy.map((r) => r.isMet)).toEqual([true, false]);
  });

  it("refuses an unknown type, in the row or in a link", () => {
    expect(() => requirementRowSchema.parse({ ...dbRow, RequirementType: "XR" })).toThrow();
    expect(() =>
      requirementRowSchema.parse({ ...dbRow, ValidatesJson: '[{"id":1,"type":"XR","number":1}]' }),
    ).toThrow();
  });

  it("throws on malformed JSON", () => {
    expect(() => requirementRowSchema.parse({ ...dbRow, DeliverablesJson: "{oops" })).toThrow();
  });

  it("keeps the list's access columns", () => {
    const row = requirementListRowSchema.parse({
      ...dbRow,
      TotalCount: 1,
      ActorAccess: "Contributor",
      ActorGrants: null,
      ActorRevokes: "update",
    });
    expect(row.ActorAccess).toBe("Contributor");
    expect(row.ActorRevokes).toBe("update");
  });
});

describe("requirementOptionSchema", () => {
  it("maps a need to a picker option", () => {
    expect(
      requirementOptionSchema.parse({
        RequirementId: 1,
        RequirementType: "BR",
        Number: 1,
        Requirement: "Cut paper use",
      }),
    ).toEqual({ id: 1, type: "BR", number: 1, text: "Cut paper use" });
  });
});

describe("requirement form", () => {
  const create = { projectId: "2", requirementType: "FR", requirement: "  Export it  " };

  it("trims the wording and leaves links alone unless set", () => {
    const parsed = createRequirementFormSchema.parse(create);
    expect(parsed).toEqual({
      projectId: 2,
      type: "FR",
      text: "Export it",
      isMet: false,
      validatesIds: null,
      deliverableIds: null,
    });
  });

  it("reads set lists, one value or several, without duplicates", () => {
    const parsed = createRequirementFormSchema.parse({
      ...create,
      isMet: "on",
      validatesSet: "1",
      "validatesIds[]": ["4", "1", "4"],
      deliverablesSet: "1",
      "deliverableIds[]": "11",
    });
    expect(parsed.isMet).toBe(true);
    expect(parsed.validatesIds).toEqual([4, 1]);
    expect(parsed.deliverableIds).toEqual([11]);
  });

  it("sends an empty list when the set flag comes alone", () => {
    const parsed = createRequirementFormSchema.parse({ ...create, validatesSet: "1" });
    expect(parsed.validatesIds).toEqual([]);
  });

  it("drops the met tick on a need", () => {
    const parsed = createRequirementFormSchema.parse({
      ...create,
      requirementType: "BR",
      isMet: "on",
    });
    expect(parsed.isMet).toBe(false);
  });

  it.each([
    ["an empty wording", { requirement: "   " }],
    ["a missing wording", { requirement: undefined }],
    ["an unknown type", { requirementType: "XR" }],
    ["a non-numeric id", { validatesSet: "1", "validatesIds[]": ["1", "1 OR 1=1"] }],
    ["a zero id", { deliverablesSet: "1", "deliverableIds[]": "0" }],
    ["an id beyond INT", { deliverablesSet: "1", "deliverableIds[]": "9999999999" }],
    [
      "too many ids",
      { validatesSet: "1", "validatesIds[]": Array.from({ length: 201 }, (_, i) => String(i + 1)) },
    ],
    ["an object where an id goes", { validatesSet: "1", "validatesIds[]": { $ne: null } }],
  ])("refuses %s", (_label, change) => {
    expect(createRequirementFormSchema.safeParse({ ...create, ...change }).success).toBe(false);
  });

  it("names the wording error", () => {
    const result = createRequirementFormSchema.safeParse({ ...create, requirement: undefined });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Enter the requirement");
  });

  it("drops fields the form does not own", () => {
    const parsed = updateRequirementFormSchema.parse({
      requirementId: "7",
      rowVer: "2001",
      requirementType: "FR",
      requirement: "Export it",
      projectId: "99",
      Number: "1",
      CreatedBy: "1",
    });
    expect(parsed).toEqual({
      requirementId: 7,
      rowVer: 2001,
      type: "FR",
      text: "Export it",
      isMet: false,
      validatesIds: null,
      deliverableIds: null,
    });
  });

  it("round-trips a row through the datasheet's form values", () => {
    const row = requirementRowSchema.parse(dbRow);
    const parsed = updateRequirementFormSchema.parse(requirementFormValues(row));
    expect(parsed).toEqual({
      requirementId: 7,
      rowVer: 2001,
      type: "FR",
      text: "Export the register",
      isMet: true,
      validatesIds: null,
      deliverableIds: null,
    });
  });
});

describe("parseValidatesParam", () => {
  it("reads digits and commas only", () => {
    expect(parseValidatesParam("1,4,4,9")).toEqual([1, 4, 9]);
    expect(parseValidatesParam(undefined)).toEqual([]);
    expect(parseValidatesParam("")).toEqual([]);
    expect(parseValidatesParam("1;DROP")).toEqual([]);
    expect(parseValidatesParam("1,,2")).toEqual([]);
    expect(parseValidatesParam("0,3")).toEqual([3]);
  });

  it("caps the list", () => {
    const raw = Array.from({ length: 250 }, (_, i) => String(i + 1)).join(",");
    expect(parseValidatesParam(raw)).toHaveLength(200);
  });
});
