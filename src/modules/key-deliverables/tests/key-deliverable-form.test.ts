import { describe, expect, it } from "vitest";
import { isOverdue } from "../schemas/key-deliverable";
import {
  keyDeliverableFormSchema,
  updateKeyDeliverableFormSchema,
} from "../schemas/key-deliverable-form";

describe("keyDeliverableFormSchema", () => {
  it("coerces FormData strings into the repository input shape", () => {
    const parsed = keyDeliverableFormSchema.parse({
      projectId: "2",
      keyRequirement: "  Fast reports generation  ",
      requestedDate: "2026-10-01",
      deadline: "2026-12-26",
      "assigneeIds[]": ["5", "6"],
      priority: "Important",
      status: "In Progress",
    });
    expect(parsed.projectId).toBe(2);
    expect(parsed.keyRequirement).toBe("Fast reports generation");
    expect(parsed.requestedDate).toEqual(new Date("2026-10-01"));
    expect(parsed.deadline).toEqual(new Date("2026-12-26"));
    expect(parsed.assigneeIds).toEqual([5, 6]);
  });

  it("accepts a single assigneeId[] string (FormData single-value case)", () => {
    const parsed = keyDeliverableFormSchema.parse({
      projectId: "2",
      keyRequirement: "R",
      "assigneeIds[]": "5",
    });
    expect(parsed.assigneeIds).toEqual([5]);
  });

  it("turns empty optional strings into null", () => {
    const parsed = keyDeliverableFormSchema.parse({
      projectId: "2",
      keyRequirement: "Requirement",
      requestedDate: "",
      deadline: "",
      priority: "",
      status: "",
    });
    expect(parsed.requestedDate).toBeNull();
    expect(parsed.deadline).toBeNull();
    expect(parsed.assigneeIds).toBeNull();
    expect(parsed.priority).toBeNull();
    expect(parsed.status).toBeNull();
  });

  it("rejects an empty requirement and an invalid date", () => {
    const result = keyDeliverableFormSchema.safeParse({
      projectId: "2",
      keyRequirement: "   ",
      deadline: "not-a-date",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("keyRequirement");
      expect(paths).toContain("deadline");
    }
  });

  it("safeParse returns failure (not throw) for a malformed assigneeIds[] entry", () => {
    // A non-numeric entry must be caught by the schema, not escape as a thrown ZodError.
    expect(() =>
      keyDeliverableFormSchema.safeParse({
        projectId: "2",
        keyRequirement: "R",
        "assigneeIds[]": "abc",
      }),
    ).not.toThrow();
    const result = keyDeliverableFormSchema.safeParse({
      projectId: "2",
      keyRequirement: "R",
      "assigneeIds[]": ["5", "abc"],
    });
    expect(result.success).toBe(false);
  });

  it("update variant requires id and rowVer", () => {
    expect(
      updateKeyDeliverableFormSchema.safeParse({
        projectId: "2",
        keyRequirement: "R",
      }).success,
    ).toBe(false);
    const parsed = updateKeyDeliverableFormSchema.parse({
      projectId: "2",
      keyRequirement: "R",
      keyDeliverableId: "7",
      rowVer: "2001",
    });
    expect(parsed.keyDeliverableId).toBe(7);
    expect(parsed.rowVer).toBe(2001);
  });
});

describe("isOverdue", () => {
  const now = new Date("2026-09-16T12:00:00Z");
  it("is true for a past deadline in a non-terminal status", () => {
    expect(isOverdue(new Date("2026-09-01"), "Pending", now)).toBe(true);
    expect(isOverdue(new Date("2026-09-01"), null, now)).toBe(true);
  });
  it("is false for future deadlines, missing deadlines and terminal statuses", () => {
    expect(isOverdue(new Date("2026-12-01"), "Pending", now)).toBe(false);
    expect(isOverdue(null, "Pending", now)).toBe(false);
    expect(isOverdue(new Date("2026-09-01"), "Completed", now)).toBe(false);
    expect(isOverdue(new Date("2026-09-01"), "Cancelled", now)).toBe(false);
  });
});
