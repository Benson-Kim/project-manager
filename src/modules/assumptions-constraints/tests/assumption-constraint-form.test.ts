import { describe, expect, it } from "vitest";
import {
  assumptionConstraintFormSchema,
  updateAssumptionConstraintFormSchema,
} from "../schemas/assumption-constraint-form";

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
    expect(parsed.validated).toBeNull();
    expect(parsed.impact).toBeNull();
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

  it("passes a type through; the proc checks it against the list (ADR-0022)", () => {
    const parsed = assumptionConstraintFormSchema.parse({ ...minimal, type: "Risk" });
    expect(parsed.type).toBe("Risk");
    expect(
      assumptionConstraintFormSchema.safeParse({ ...minimal, type: "x".repeat(51) }).success,
    ).toBe(false);
  });

  // Validated is a managed list since migration 053 (ADR-0054), so it takes any label the live
  // list offers — not only Yes and No — and the proc, not this schema, is what checks it.
  it("keeps a validated label the list offers", () => {
    expect(assumptionConstraintFormSchema.parse({ ...minimal, validated: "Yes" }).validated).toBe(
      "Yes",
    );
    expect(
      assumptionConstraintFormSchema.parse({ ...minimal, validated: "Partly" }).validated,
    ).toBe("Partly");
  });

  it("coerces an empty-string validated to null and refuses one past the label length", () => {
    expect(
      assumptionConstraintFormSchema.parse({ ...minimal, validated: "" }).validated,
    ).toBeNull();
    expect(
      assumptionConstraintFormSchema.safeParse({ ...minimal, validated: "x".repeat(51) }).success,
    ).toBe(false);
  });

  it("coerces empty-string impact to null", () => {
    const parsed = assumptionConstraintFormSchema.parse({ ...minimal, impact: "" });
    expect(parsed.impact).toBeNull();
  });

  it("keeps a supplied impact string", () => {
    const parsed = assumptionConstraintFormSchema.parse({ ...minimal, impact: "High" });
    expect(parsed.impact).toBe("High");
  });

  it("accepts all three impact values", () => {
    for (const val of ["High", "Medium", "Low"] as const) {
      const parsed = assumptionConstraintFormSchema.parse({ ...minimal, impact: val });
      expect(parsed.impact).toBe(val);
    }
  });

  it("passes an impact through; the proc checks it against the list (ADR-0022)", () => {
    const parsed = assumptionConstraintFormSchema.parse({ ...minimal, impact: "Critical" });
    expect(parsed.impact).toBe("Critical");
    expect(
      assumptionConstraintFormSchema.safeParse({ ...minimal, impact: "x".repeat(51) }).success,
    ).toBe(false);
  });

  // The mitigation plan left the sheet on 2026-10-26; the column stays, but the
  // form no longer carries it, so a posted one is dropped rather than written.
  it("drops a posted mitigationPlan", () => {
    const parsed = assumptionConstraintFormSchema.parse({
      ...minimal,
      mitigationPlan: "Keep a buffer",
    });
    expect(parsed).not.toHaveProperty("mitigationPlan");
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
