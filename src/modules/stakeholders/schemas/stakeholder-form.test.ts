import { describe, expect, it } from "vitest";
import { stakeholderFormSchema, updateStakeholderFormSchema } from "./stakeholder-form";

/** The sheet form schema coerces FormData strings into the repo input shape. */
describe("stakeholderFormSchema", () => {
  it("parses a minimal FormData-shaped object", () => {
    const parsed = stakeholderFormSchema.parse({ projectId: "2", firstName: "Gary" });
    expect(parsed.projectId).toBe(2);
    expect(parsed.firstName).toBe("Gary");
    expect(parsed.lastName).toBeNull();
    expect(parsed.communicationPreference).toBeNull();
    expect(parsed.engagementLevel).toBeNull();
  });

  it("keeps vocabulary values and normalises empty selects to null", () => {
    const parsed = stakeholderFormSchema.parse({
      projectId: "2",
      firstName: "Gary",
      communicationPreference: "Email",
      engagementLevel: "Medium",
      emailAddress: "gary@example.com",
    });
    expect(parsed.communicationPreference).toBe("Email");
    expect(parsed.engagementLevel).toBe("Medium");
    expect(parsed.emailAddress).toBe("gary@example.com");
  });

  it("rejects an empty first name", () => {
    const result = stakeholderFormSchema.safeParse({ projectId: "2", firstName: "   " });
    expect(result.success).toBe(false);
  });

  it("rejects a missing project", () => {
    const result = stakeholderFormSchema.safeParse({ projectId: "", firstName: "Gary" });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid email address", () => {
    const result = stakeholderFormSchema.safeParse({
      projectId: "2",
      firstName: "Gary",
      emailAddress: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a value outside the engagement vocabulary", () => {
    const result = stakeholderFormSchema.safeParse({
      projectId: "2",
      firstName: "Gary",
      engagementLevel: "Extreme",
    });
    expect(result.success).toBe(false);
  });

  it("turns empty optional strings into null", () => {
    const parsed = stakeholderFormSchema.parse({
      projectId: "2",
      firstName: "Gary",
      lastName: "  ",
      phoneNumber: "",
    });
    expect(parsed.lastName).toBeNull();
    expect(parsed.phoneNumber).toBeNull();
  });
});

describe("updateStakeholderFormSchema", () => {
  it("coerces stakeholderId and rowVer from FormData strings", () => {
    const parsed = updateStakeholderFormSchema.parse({
      projectId: "2",
      firstName: "Gary",
      stakeholderId: "1",
      rowVer: "2001",
    });
    expect(parsed.stakeholderId).toBe(1);
    expect(parsed.rowVer).toBe(2001);
  });

  it("rejects a missing rowVer", () => {
    const result = updateStakeholderFormSchema.safeParse({
      projectId: "2",
      firstName: "Gary",
      stakeholderId: "1",
    });
    expect(result.success).toBe(false);
  });
});
