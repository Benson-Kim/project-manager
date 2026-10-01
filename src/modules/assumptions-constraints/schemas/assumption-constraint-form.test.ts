import { describe, expect, it } from "vitest";
import {
  assumptionConstraintFormSchema,
  updateAssumptionConstraintFormSchema,
} from "./assumption-constraint-form";

/**
 * AssumptionConstraint form contract (#13): FormData strings → repository
 * input shape. Covers required description, optional fields → null,
 * checkbox coercion, rowVer coercion.
 */

const minimal = { projectId: "2", description: "An assumption about scope" };

describe("assumptionConstraintFormSchema", () => {
  it("parses a minimal create — optional fields are null/false", () => {
    const parsed = assumptionConstraintFormSchema.parse(minimal);
    expect(parsed.projectId).toBe(2);
    expect(parsed.description).toBe("An assumption about scope");
    expect(parsed.type).toBeNull();
    expect(parsed.isValidated).toBe(false);
    expect(parsed.impact).toBeNull();
    expect(parsed.mitigationPlan).toBeNull();
  });

  it("trims and keeps a supplied description", () => {
    const parsed = assumptionConstraintFormSchema.parse({
      ...minimal,
      description: "  An assumption about scope  ",
    });
    expect(parsed.description).toBe("An assumption about scope");
  });

  it("rejects an empty description", () => {
    const result = assumptionConstraintFormSchema.safeParse({
      ...minimal,
      description: "   ",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === "description")).toBe(true);
    }
  });

  it("rejects a missing description", () => {
    const result = assumptionConstraintFormSchema.safeParse({ projectId: "2" });
    expect(result.success).toBe(false);
  });

  it("coerces empty-string type to null", () => {
    const parsed = assumptionConstraintFormSchema.parse({ ...minimal, type: "" });
    expect(parsed.type).toBeNull();
  });

  it("keeps a supplied type string", () => {
    const parsed = assumptionConstraintFormSchema.parse({ ...minimal, type: "Assumption" });
    expect(parsed.type).toBe("Assumption");
  });

  it("coerces checkbox 'on' to true for isValidated", () => {
    const parsed = assumptionConstraintFormSchema.parse({
      ...minimal,
      isValidated: "on",
    });
    expect(parsed.isValidated).toBe(true);
  });

  it("coerces absent checkbox to false for isValidated", () => {
    const parsed = assumptionConstraintFormSchema.parse({ ...minimal });
    expect(parsed.isValidated).toBe(false);
  });

  it("coerces empty-string impact to null", () => {
    const parsed = assumptionConstraintFormSchema.parse({ ...minimal, impact: "" });
    expect(parsed.impact).toBeNull();
  });

  it("keeps a supplied impact string", () => {
    const parsed = assumptionConstraintFormSchema.parse({ ...minimal, impact: "High" });
    expect(parsed.impact).toBe("High");
  });

  it("coerces whitespace-only mitigationPlan to null", () => {
    const parsed = assumptionConstraintFormSchema.parse({
      ...minimal,
      mitigationPlan: "   ",
    });
    expect(parsed.mitigationPlan).toBeNull();
  });
});

describe("updateAssumptionConstraintFormSchema", () => {
  it("coerces assumptionConstraintId and rowVer from FormData strings", () => {
    const parsed = updateAssumptionConstraintFormSchema.parse({
      ...minimal,
      assumptionConstraintId: "5",
      rowVer: "99",
    });
    expect(parsed.assumptionConstraintId).toBe(5);
    expect(parsed.rowVer).toBe(99);
  });

  it("requires assumptionConstraintId to be positive", () => {
    const result = updateAssumptionConstraintFormSchema.safeParse({
      ...minimal,
      assumptionConstraintId: "0",
      rowVer: "1",
    });
    expect(result.success).toBe(false);
  });
});
