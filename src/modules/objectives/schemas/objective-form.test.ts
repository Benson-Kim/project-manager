import { describe, expect, it } from "vitest";
import { objectiveFormSchema, updateObjectiveFormSchema } from "./objective-form";

/**
 * Objective form contract (#10): FormData strings → repository input shape.
 * Covers required objectiveText, optional fields → null, coercion of ids.
 */

const minimal = { projectId: "2", objectiveText: "Improve system reliability" };

describe("objectiveFormSchema", () => {
  it("parses a minimal create form — optional fields become null", () => {
    const parsed = objectiveFormSchema.parse(minimal);
    expect(parsed.projectId).toBe(2);
    expect(parsed.objectiveText).toBe("Improve system reliability");
    expect(parsed.qMeasurable).toBeNull();
    expect(parsed.qSuccess).toBeNull();
    expect(parsed.qAlignmentStrategy).toBeNull();
  });

  it("keeps supplied optional fields", () => {
    const parsed = objectiveFormSchema.parse({
      ...minimal,
      qMeasurable: "Yes",
      qSuccess: "Metric > 99%",
      qAlignmentStrategy: "Aligned with strategy A",
    });
    expect(parsed.qMeasurable).toBe("Yes");
    expect(parsed.qSuccess).toBe("Metric > 99%");
    expect(parsed.qAlignmentStrategy).toBe("Aligned with strategy A");
  });

  it("coerces whitespace-only optional fields to null", () => {
    const parsed = objectiveFormSchema.parse({
      ...minimal,
      qMeasurable: "  ",
      qSuccess: "  ",
    });
    expect(parsed.qMeasurable).toBeNull();
    expect(parsed.qSuccess).toBeNull();
  });

  it("rejects an empty objectiveText", () => {
    const result = objectiveFormSchema.safeParse({ projectId: "2", objectiveText: "   " });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === "objectiveText")).toBe(true);
    }
  });

  it("rejects a missing objectiveText", () => {
    const result = objectiveFormSchema.safeParse({ projectId: "2" });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid projectId", () => {
    const result = objectiveFormSchema.safeParse({ projectId: "0", objectiveText: "Test" });
    expect(result.success).toBe(false);
  });
});

describe("updateObjectiveFormSchema", () => {
  it("coerces objectiveId and rowVer from FormData strings", () => {
    const parsed = updateObjectiveFormSchema.parse({
      ...minimal,
      objectiveId: "3",
      rowVer: "99",
    });
    expect(parsed.objectiveId).toBe(3);
    expect(parsed.rowVer).toBe(99);
  });
});
