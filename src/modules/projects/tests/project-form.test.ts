import "@/lib/rich-text/sanitize";
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

describe("project dates in order", () => {
  const base = { projectName: "X" };
  const update = { ...base, projectId: "1", rowVer: "1" };

  it("lets a project saved with inverted dates be edited while they stay as stored", () => {
    const legacy = {
      ...update,
      startDate: "2026-06-01",
      endDate: "2026-05-01",
      estimatedCompletionDate: "2026-04-01",
      startDateWas: "2026-06-01",
      endDateWas: "2026-05-01",
      estimatedCompletionDateWas: "2026-04-01",
    };
    expect(updateProjectFormSchema.safeParse({ ...legacy, projectName: "Y" }).success).toBe(true);
    const moved = updateProjectFormSchema.safeParse({ ...legacy, startDate: "2026-06-02" });
    expect(moved.error?.issues.map((i) => i.path)).toEqual([
      ["endDate"],
      ["estimatedCompletionDate"],
    ]);
  });

  it.each([
    ["create", projectFormSchema, base],
    ["update", updateProjectFormSchema, update],
  ] as const)("%s rejects an end date before the start date, on endDate", (_, schema, values) => {
    const result = schema.safeParse({ ...values, startDate: "2026-03-10", endDate: "2026-03-09" });
    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual([
      expect.objectContaining({
        path: ["endDate"],
        message: "End date can't be before start date.",
      }),
    ]);
  });

  it("rejects an estimated completion before the start date", () => {
    const result = projectFormSchema.safeParse({
      ...base,
      startDate: "2026-03-10",
      estimatedCompletionDate: "2026-01-01",
    });
    expect(result.error?.issues.map((i) => i.path)).toEqual([["estimatedCompletionDate"]]);
  });

  it("accepts the same day, and a range with one side empty", () => {
    expect(
      projectFormSchema.safeParse({ ...base, startDate: "2026-03-10", endDate: "2026-03-10" })
        .success,
    ).toBe(true);
    expect(projectFormSchema.safeParse({ ...base, endDate: "2020-01-01" }).success).toBe(true);
  });
});
