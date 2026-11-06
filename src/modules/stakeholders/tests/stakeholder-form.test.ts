import { describe, expect, it } from "vitest";
import { messages } from "@/lib/messages";
import { stakeholderFormSchema, updateStakeholderFormSchema } from "../schemas/stakeholder-form";

/** The sheet form schema coerces FormData strings into the repo input shape. */
describe("stakeholderFormSchema", () => {
  it("parses a minimal FormData-shaped object", () => {
    const parsed = stakeholderFormSchema.parse({ projectId: "2", firstName: "Gary" });
    expect(parsed.projectId).toBe(2);
    expect(parsed.firstName).toBe("Gary");
    expect(parsed.lastName).toBeNull();
    expect(parsed.communicationPreference).toBeNull();
    expect(parsed.engagementLevel).toBeNull();
    expect(parsed.communicationPurpose).toBeNull();
    expect(parsed.keyMessageStrategy).toBeNull();
    expect(parsed.communicationFrequency).toBeNull();
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

  it("keeps the communication plan, and trims the strategy (BL34)", () => {
    const parsed = stakeholderFormSchema.parse({
      projectId: "2",
      firstName: "Gary",
      communicationPurpose: "Gather Requirements",
      keyMessageStrategy: "  Lead with the schedule risk, then the ask  ",
      communicationFrequency: "Milestone-Driven",
    });
    expect(parsed.communicationPurpose).toBe("Gather Requirements");
    expect(parsed.keyMessageStrategy).toBe("Lead with the schedule risk, then the ask");
    expect(parsed.communicationFrequency).toBe("Milestone-Driven");
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

  it("leaves the engagement list check to the proc (managed list, ADR-0022)", () => {
    const parsed = stakeholderFormSchema.parse({
      projectId: "2",
      firstName: "Gary",
      engagementLevel: "Extreme",
    });
    expect(parsed.engagementLevel).toBe("Extreme");
  });

  it("rejects an engagement level longer than a list label", () => {
    const result = stakeholderFormSchema.safeParse({
      projectId: "2",
      firstName: "Gary",
      engagementLevel: "x".repeat(51),
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

describe("stakeholderFormSchema place and stance", () => {
  it("leaves an unplaced stakeholder unplaced when the fields are absent or empty", () => {
    for (const extra of [{}, { power: "", interest: "", stance: "" }]) {
      const parsed = stakeholderFormSchema.parse({ projectId: "2", firstName: "Gary", ...extra });
      expect(parsed).toMatchObject({ power: null, interest: null, stance: null });
    }
  });

  it("coerces whole-number scores, keeping 0 and 100", () => {
    const parsed = stakeholderFormSchema.parse({
      projectId: "2",
      firstName: "Gary",
      power: "0",
      interest: " 100 ",
      stance: "Blocker",
    });
    expect(parsed).toMatchObject({ power: 0, interest: 100, stance: "Blocker" });
  });

  it.each(["101", "-1", "4.5", "1e2", "abc"])(
    "refuses the score %s with the range message",
    (v) => {
      const result = stakeholderFormSchema.safeParse({
        projectId: "2",
        firstName: "Gary",
        power: v,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(["power"]);
        expect(result.error.issues[0].message).toBe(messages.stakeholders.scoreRange);
      }
    },
  );

  it.each(["champion", "Ally"])("refuses the stance %s", (v) => {
    const result = stakeholderFormSchema.safeParse({
      projectId: "2",
      firstName: "Gary",
      stance: v,
    });
    expect(result.success).toBe(false);
  });
});

describe("updateStakeholderFormSchema", () => {
  const placed = { power: "60", interest: "", stance: "Neutral" };

  it("coerces stakeholderId and rowVer from FormData strings", () => {
    const parsed = updateStakeholderFormSchema.parse({
      projectId: "2",
      firstName: "Gary",
      stakeholderId: "1",
      rowVer: "2001",
      ...placed,
    });
    expect(parsed.stakeholderId).toBe(1);
    expect(parsed.rowVer).toBe(2001);
    expect(parsed).toMatchObject({ power: 60, interest: null, stance: "Neutral" });
  });

  it("rejects a missing rowVer", () => {
    const result = updateStakeholderFormSchema.safeParse({
      projectId: "2",
      firstName: "Gary",
      stakeholderId: "1",
      ...placed,
    });
    expect(result.success).toBe(false);
  });

  it.each(["power", "interest", "stance"])("refuses an update that leaves out %s", (field) => {
    const values: Record<string, string> = {
      projectId: "2",
      firstName: "Gary",
      stakeholderId: "1",
      rowVer: "2001",
      ...placed,
    };
    delete values[field];
    const result = updateStakeholderFormSchema.safeParse(values);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].path).toEqual([field]);
  });
});
