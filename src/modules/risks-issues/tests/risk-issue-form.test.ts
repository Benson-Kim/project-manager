import { describe, expect, it } from "vitest";
import "@/lib/rich-text/sanitize";
import { riskIssueFormSchema, updateRiskIssueFormSchema } from "../schemas/risk-issue-form";
import { isClosed, RISK_ISSUE_CATEGORY, RISK_ISSUE_STATUS } from "../schemas/risk-issue";

/**
 * RiskIssue form contract (#14): FormData strings → repository input shape.
 * Covers the required rich-text description, optional fields → null, the date
 * coercion and the due-date order rule.
 */
const minimal = { projectId: "2", description: "<p>The vendor may be late</p>" };

describe("riskIssueFormSchema", () => {
  it("parses a minimal create — every optional field is null", () => {
    const parsed = riskIssueFormSchema.parse(minimal);
    expect(parsed.projectId).toBe(2);
    expect(parsed.description).toBe("<p>The vendor may be late</p>");
    expect(parsed.category).toBeNull();
    expect(parsed.status).toBeNull();
    expect(parsed.priority).toBeNull();
    expect(parsed.impact).toBeNull();
    expect(parsed.probability).toBeNull();
    expect(parsed.mitigationPlan).toBeNull();
    expect(parsed.owner).toBeNull();
    expect(parsed.dateIdentified).toBeNull();
    expect(parsed.dueDate).toBeNull();
  });

  it("rejects an empty description — an empty document is not a record", () => {
    for (const description of ["", "<p></p>", "   "]) {
      const result = riskIssueFormSchema.safeParse({ ...minimal, description });
      expect(result.success, description).toBe(false);
    }
  });

  it("keeps the list values; the proc checks them against the live list (ADR-0022)", () => {
    const parsed = riskIssueFormSchema.parse({
      ...minimal,
      category: RISK_ISSUE_CATEGORY.issue,
      status: RISK_ISSUE_STATUS.open,
      priority: "High",
      impact: "Low",
      probability: "High",
    });
    expect(parsed.category).toBe("Issue");
    expect(parsed.status).toBe("Open");
    expect(parsed.priority).toBe("High");
    expect(parsed.impact).toBe("Low");
    expect(parsed.probability).toBe("High");
  });

  it("coerces an empty list choice to null", () => {
    const parsed = riskIssueFormSchema.parse({ ...minimal, category: "", status: "" });
    expect(parsed.category).toBeNull();
    expect(parsed.status).toBeNull();
  });

  it("parses the dates and trims the owner", () => {
    const parsed = riskIssueFormSchema.parse({
      ...minimal,
      owner: "  Dana  ",
      dateIdentified: "2026-03-01",
      dueDate: "2026-04-01",
    });
    expect(parsed.owner).toBe("Dana");
    expect(parsed.dateIdentified).toEqual(new Date("2026-03-01"));
    expect(parsed.dueDate).toEqual(new Date("2026-04-01"));
  });

  it("rejects an unparseable date on its own field", () => {
    const result = riskIssueFormSchema.safeParse({ ...minimal, dueDate: "not a date" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === "dueDate")).toBe(true);
    }
  });

  it("refuses a due date before the date identified, reporting it on dueDate", () => {
    const result = riskIssueFormSchema.safeParse({
      ...minimal,
      dateIdentified: "2026-04-01",
      dueDate: "2026-03-01",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === "dueDate")).toBe(true);
    }
  });

  it("accepts a due date equal to the date identified", () => {
    expect(
      riskIssueFormSchema.safeParse({
        ...minimal,
        dateIdentified: "2026-04-01",
        dueDate: "2026-04-01",
      }).success,
    ).toBe(true);
  });
});

describe("updateRiskIssueFormSchema", () => {
  const stored = { ...minimal, riskIssueId: "5", rowVer: "42" };

  it("coerces the id and rowVer", () => {
    const parsed = updateRiskIssueFormSchema.parse(stored);
    expect(parsed.riskIssueId).toBe(5);
    expect(parsed.rowVer).toBe(42);
  });

  it("lets a record migrated with inverted dates be edited, as long as they are untouched", () => {
    expect(
      updateRiskIssueFormSchema.safeParse({
        ...stored,
        dateIdentified: "2026-04-01",
        dueDate: "2026-03-01",
        dateIdentifiedWas: "2026-04-01",
        dueDateWas: "2026-03-01",
      }).success,
    ).toBe(true);
  });

  it("still refuses when one of that inverted pair is changed", () => {
    expect(
      updateRiskIssueFormSchema.safeParse({
        ...stored,
        dateIdentified: "2026-05-01",
        dueDate: "2026-03-01",
        dateIdentifiedWas: "2026-04-01",
        dueDateWas: "2026-03-01",
      }).success,
    ).toBe(false);
  });
});

describe("isClosed", () => {
  it("is true only for the locked Closed label", () => {
    expect(isClosed(RISK_ISSUE_STATUS.closed)).toBe(true);
    expect(isClosed(RISK_ISSUE_STATUS.open)).toBe(false);
    expect(isClosed("In Progress")).toBe(false);
    expect(isClosed(null)).toBe(false);
    expect(isClosed(undefined)).toBe(false);
  });
});
