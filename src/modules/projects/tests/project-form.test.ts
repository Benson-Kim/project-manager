import { describe, expect, it } from "vitest";
import { projectFormSchema, updateProjectFormSchema } from "../schemas/project-form";

/** The charter form schema coerces FormData strings into the repo input shape. */
describe("projectFormSchema", () => {
  it("parses a minimal FormData-shaped object with defaults", () => {
    const parsed = projectFormSchema.parse({ projectName: "Network refresh" });
    expect(parsed.projectName).toBe("Network refresh");
    expect(parsed.do).toBe(false);
    expect(parsed.a1).toBe(false);
    expect(parsed.projectManager).toBeNull();
    expect(parsed.financingCost).toBeNull();
    expect(parsed.startDate).toBeNull();
  });

  it("coerces checkbox 'on', money strings and ISO dates", () => {
    const parsed = projectFormSchema.parse({
      projectName: "X",
      do: "on",
      da: "on",
      financingCost: "1500.50",
      startDate: "2026-01-05",
      projectStatus: "In progress",
    });
    expect(parsed.do).toBe(true);
    expect(parsed.da).toBe(true);
    expect(parsed.financingCost).toBe(1500.5);
    expect(parsed.startDate).toEqual(new Date("2026-01-05"));
    expect(parsed.projectStatus).toBe("In progress");
  });

  it("rejects an empty project name", () => {
    const result = projectFormSchema.safeParse({ projectName: "   " });
    expect(result.success).toBe(false);
  });

  it("rejects a non-numeric cost", () => {
    const result = projectFormSchema.safeParse({ projectName: "X", financingCost: "abc" });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid date", () => {
    const result = projectFormSchema.safeParse({ projectName: "X", endDate: "not-a-date" });
    expect(result.success).toBe(false);
  });

  it("turns empty optional strings into null", () => {
    const parsed = projectFormSchema.parse({ projectName: "X", mandate: "  " });
    expect(parsed.mandate).toBeNull();
  });
});

describe("updateProjectFormSchema", () => {
  it("coerces projectId and rowVer from FormData strings", () => {
    const parsed = updateProjectFormSchema.parse({
      projectName: "X",
      projectId: "2",
      rowVer: "2001",
    });
    expect(parsed.projectId).toBe(2);
    expect(parsed.rowVer).toBe(2001);
  });

  it("rejects a missing rowVer", () => {
    const result = updateProjectFormSchema.safeParse({ projectName: "X", projectId: "2" });
    expect(result.success).toBe(false);
  });
});
