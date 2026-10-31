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
  // ufn_Requirement_AncestorPath (ADR-0048): a root row, so its path is its own number.
  Ref: "FR-3",
  SortPath: "0000000003",
  Depth: 0,
  ChildCount: 0,
  ParentRequirementId: null,
  MoSCoW: null,
  AcceptanceCriteria: null,
  EstimateDays: null,
  OwnerStakeholderId: null,
  OwnerName: null,
  Requirement: "Export the register",
  IsMet: true,
  CreatedAtUtc: new Date("2026-10-21T08:00:00Z"),
  UpdatedAtUtc: null,
  RowVer: "2001",
  ValidatesJson:
    '[{"id":1,"type":"BR","ref":"BR-1","sortPath":"0000000001"},' +
    '{"id":4,"type":"SR","ref":"SR-2","sortPath":"0000000002"}]',
  ValidatedByJson: null,
  DeliverablesJson: '[{"id":11},{"id":12}]',
};

describe("requirementRowSchema", () => {
  it("parses the JSON columns into links and allocation ids", () => {
    const row = requirementRowSchema.parse(dbRow);
    expect(row.Validates).toEqual([
      { id: 1, type: "BR", ref: "BR-1", sortPath: "0000000001" },
      { id: 4, type: "SR", ref: "SR-2", sortPath: "0000000002" },
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
        '[{"id":7,"type":"FR","ref":"FR-3","sortPath":"0000000003","isMet":1},' +
        '{"id":8,"type":"TR","ref":"TR-1","sortPath":"0000000001","isMet":false}]',
      DeliverablesJson: null,
    });
    expect(row.ValidatedBy.map((r) => r.isMet)).toEqual([true, false]);
  });

  it("refuses an unknown type, in the row or in a link", () => {
    expect(() => requirementRowSchema.parse({ ...dbRow, RequirementType: "XR" })).toThrow();
    expect(() =>
      requirementRowSchema.parse({
        ...dbRow,
        ValidatesJson: '[{"id":1,"type":"XR","ref":"XR-1","sortPath":"0000000001"}]',
      }),
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
        Ref: "BR-1.2",
        Requirement: "Cut paper use",
      }),
    ).toEqual({ id: 1, type: "BR", ref: "BR-1.2", text: "Cut paper use" });
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
      // Absent means a root requirement; usp_Requirement_Create reads NULL as "no parent".
      parentRequirementId: null,
      validatesIds: null,
      deliverableIds: null,
      // Absent planning fields are NULL, not "" or 0 (ADR-0052).
      moscow: null,
      acceptanceCriteria: null,
      estimateDays: null,
      ownerStakeholderId: null,
    });
  });

  it("carries the planning fields, treating blanks as none (ADR-0052)", () => {
    expect(
      createRequirementFormSchema.parse({
        ...create,
        moscow: "M",
        acceptanceCriteria: "  Signed off  ",
        estimateDays: "2.5",
        ownerStakeholderId: "14",
      }),
    ).toMatchObject({
      moscow: "M",
      acceptanceCriteria: "Signed off",
      estimateDays: 2.5,
      ownerStakeholderId: 14,
    });
    expect(
      createRequirementFormSchema.parse({
        ...create,
        moscow: "",
        acceptanceCriteria: "   ",
        estimateDays: "",
        ownerStakeholderId: "",
      }),
    ).toMatchObject({
      moscow: null,
      acceptanceCriteria: null,
      estimateDays: null,
      ownerStakeholderId: null,
    });
  });

  it("refuses an out-of-range planning field", () => {
    for (const bad of [
      { moscow: "X" },
      { estimateDays: "-1" },
      { estimateDays: "1.25" },
      { estimateDays: "100000" },
      { estimateDays: "abc" },
      { ownerStakeholderId: "0" },
      { acceptanceCriteria: "x".repeat(4001) },
    ]) {
      expect(
        () => createRequirementFormSchema.parse({ ...create, ...bad }),
        JSON.stringify(bad),
      ).toThrow();
    }
  });

  it("carries the parent a sub-requirement goes under (ADR-0048)", () => {
    expect(
      createRequirementFormSchema.parse({ ...create, parentRequirementId: "9" }),
    ).toMatchObject({ parentRequirementId: 9 });
  });

  it("refuses a parent that is not a positive id", () => {
    for (const bad of ["0", "-1", "abc", "1.5", ""]) {
      expect(() =>
        createRequirementFormSchema.parse({ ...create, parentRequirementId: bad }),
      ).toThrow();
    }
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
