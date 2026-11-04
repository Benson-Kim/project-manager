import { describe, expect, it } from "vitest";
import "@/lib/rich-text/sanitize";
import {
  createDecisionFormSchema,
  decisionFormValues,
  updateDecisionFormSchema,
} from "../schemas/decision-form";
import { decisionRowSchema } from "../schemas/decision";

const row = decisionRowSchema.parse({
  DecisionId: 1,
  ProjectId: 2,
  DecisionNumber: 3,
  Title: "Pick the hosting vendor",
  DateLogged: new Date("2026-03-01T00:00:00Z"),
  OwnerStakeholderId: 4,
  Status: "Approved",
  ProblemContext: "<p>Two vendors bid</p>",
  OptionsConsidered: null,
  Rationale: null,
  NextSteps: null,
  SupersededByDecisionId: null,
  ImpactedAreas: '[{"label":"Budget"}]',
  ConsultedStakeholderIds: '[{"id":9}]',
  CreatedAtUtc: new Date("2026-01-01T00:00:00Z"),
  UpdatedAtUtc: null,
  RowVer: "42",
});

/** What the Sheet submits: every field, both set flags. */
const sheet = {
  projectId: "2",
  title: "Pick the hosting vendor",
  status: "Approved",
  dateLogged: "2026-03-01",
  ownerStakeholderId: "4",
  supersededByDecisionId: "",
  impactedAreasSet: "1",
  "impactedAreas[]": ["Budget", "Scope"],
  stakeholdersSet: "1",
  "consultedStakeholderIds[]": ["5", "9"],
};

describe("decision form schema", () => {
  it("needs a title", () => {
    expect(createDecisionFormSchema.safeParse({ ...sheet, title: "   " }).success).toBe(false);
  });

  it("reads the sheet's strings into the repository's input", () => {
    const values = createDecisionFormSchema.parse(sheet);
    expect(values).toMatchObject({
      projectId: 2,
      title: "Pick the hosting vendor",
      status: "Approved",
      ownerStakeholderId: 4,
      supersededByDecisionId: null,
      impactedAreas: ["Budget", "Scope"],
      consultedStakeholderIds: [5, 9],
    });
    expect(values.dateLogged?.toISOString()).toBe("2026-03-01T00:00:00.000Z");
  });

  it("takes one chip as a set of one, and drops duplicates", () => {
    const values = createDecisionFormSchema.parse({
      ...sheet,
      "impactedAreas[]": "Budget",
      "consultedStakeholderIds[]": ["5", "5"],
    });
    expect(values.impactedAreas).toEqual(["Budget"]);
    expect(values.consultedStakeholderIds).toEqual([5]);
  });

  it("a field the form showed and the user emptied is an empty set, not an absent one", () => {
    const values = createDecisionFormSchema.parse({
      ...sheet,
      "impactedAreas[]": [],
      "consultedStakeholderIds[]": [],
    });
    expect(values.impactedAreas).toEqual([]);
    expect(values.consultedStakeholderIds).toEqual([]);
  });

  it("refuses a date it cannot read", () => {
    expect(createDecisionFormSchema.safeParse({ ...sheet, dateLogged: "not a date" }).success).toBe(
      false,
    );
  });

  it("clears the owner and the supersession when their selects are blank", () => {
    const values = createDecisionFormSchema.parse({
      ...sheet,
      ownerStakeholderId: "",
      supersededByDecisionId: "",
    });
    expect(values.ownerStakeholderId).toBeNull();
    expect(values.supersededByDecisionId).toBeNull();
  });

  it("the sheet's save replaces both sets", () => {
    const values = updateDecisionFormSchema.parse({
      ...sheet,
      decisionId: "1",
      rowVer: "42",
    });
    expect(values.impactedAreas).toEqual(["Budget", "Scope"]);
    expect(values.consultedStakeholderIds).toEqual([5, 9]);
  });

  // The guardrail the Set flags exist for: a cell edit must not wipe the link tables.
  it("a datasheet cell edit leaves both sets alone", () => {
    const cell = decisionFormValues(row);
    expect(cell).not.toHaveProperty("impactedAreasSet");
    expect(cell).not.toHaveProperty("stakeholdersSet");
    const values = updateDecisionFormSchema.parse({ ...cell, title: "A newer title" });
    expect(values.impactedAreas).toBeNull();
    expect(values.consultedStakeholderIds).toBeNull();
    expect(values.title).toBe("A newer title");
  });

  it("a cell edit round-trips the rest of the row unchanged", () => {
    const values = updateDecisionFormSchema.parse(decisionFormValues(row));
    expect(values).toMatchObject({
      decisionId: 1,
      rowVer: 42,
      title: "Pick the hosting vendor",
      status: "Approved",
      ownerStakeholderId: 4,
      supersededByDecisionId: null,
    });
    expect(values.dateLogged?.toISOString()).toBe("2026-03-01T00:00:00.000Z");
  });
});
