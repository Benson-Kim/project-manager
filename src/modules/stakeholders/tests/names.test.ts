import { describe, expect, it } from "vitest";
import { stakeholderOption, typedNameValues } from "../names";
import { stakeholderFormSchema } from "../schemas/stakeholder-form";

describe("typedNameValues", () => {
  it("takes the first word as the first name and the rest as the last name", () => {
    expect(typedNameValues(7, "Marcus Chen")).toEqual({
      projectId: "7",
      firstName: "Marcus",
      lastName: "Chen",
    });
    expect(typedNameValues(7, "  Ana   de la  Cruz ")).toMatchObject({
      firstName: "Ana",
      lastName: "de la Cruz",
    });
  });

  it("leaves the last name empty for a single word", () => {
    expect(typedNameValues(7, "Cher")).toMatchObject({ firstName: "Cher", lastName: "" });
  });

  it("gives values the stakeholder form accepts, with no last name stored as none", () => {
    const parsed = stakeholderFormSchema.parse(typedNameValues(7, "Cher"));
    expect(parsed).toMatchObject({ projectId: 7, firstName: "Cher", lastName: null });
  });

  it("is refused by the form when the first name is too long", () => {
    expect(stakeholderFormSchema.safeParse(typedNameValues(7, "x".repeat(256))).success).toBe(
      false,
    );
  });
});

describe("stakeholderOption", () => {
  it("names a stakeholder by first and last name", () => {
    expect(stakeholderOption({ StakeholderId: 3, FirstName: "Marcus", LastName: "Chen" })).toEqual({
      stakeholderId: 3,
      name: "Marcus Chen",
    });
  });

  it("uses the first name alone when there is no last name", () => {
    expect(stakeholderOption({ StakeholderId: 4, FirstName: "Cher", LastName: null })).toEqual({
      stakeholderId: 4,
      name: "Cher",
    });
  });
});
