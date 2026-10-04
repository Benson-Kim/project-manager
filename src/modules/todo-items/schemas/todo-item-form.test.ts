import { describe, expect, it } from "vitest";
import { todoItemFormSchema, updateTodoItemFormSchema } from "./todo-item-form";
import { isApproachingDeadline, isOverdue } from "./todo-item";

/**
 * TodoItem form contract: FormData strings → repository input shape.
 * Covers required field, vocab validation, date coercion, optional → null, isOverdue logic.
 */

const minimal = { projectId: "3", todoItem: "Review deliverables" };
const DAY_MS = 86_400_000;

describe("todoItemFormSchema", () => {
  it("parses a minimal form", () => {
    const parsed = todoItemFormSchema.parse(minimal);
    expect(parsed.projectId).toBe(3);
    expect(parsed.todoItem).toBe("Review deliverables");
    expect(parsed.dueDate).toBeNull();
    expect(parsed.priority).toBeNull();
    expect(parsed.status).toBeNull();
    expect(parsed.dailyActivityId).toBeNull();
  });

  it("rejects an empty todoItem", () => {
    const result = todoItemFormSchema.safeParse({ ...minimal, todoItem: "  " });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === "todoItem")).toBe(true);
    }
  });

  it("rejects a missing todoItem", () => {
    const result = todoItemFormSchema.safeParse({ projectId: "3" });
    expect(result.success).toBe(false);
  });

  it("coerces a valid YYYY-MM-DD dueDate to a Date", () => {
    const parsed = todoItemFormSchema.parse({ ...minimal, dueDate: "2025-12-31" });
    expect(parsed.dueDate).toBeInstanceOf(Date);
    expect(parsed.dueDate?.toISOString().slice(0, 10)).toBe("2025-12-31");
  });

  it("rejects an invalid dueDate string", () => {
    const result = todoItemFormSchema.safeParse({ ...minimal, dueDate: "not-a-date" });
    expect(result.success).toBe(false);
  });

  it("coerces empty dueDate to null", () => {
    const parsed = todoItemFormSchema.parse({ ...minimal, dueDate: "" });
    expect(parsed.dueDate).toBeNull();
  });

  it("accepts a valid priority", () => {
    const parsed = todoItemFormSchema.parse({ ...minimal, priority: "High" });
    expect(parsed.priority).toBe("High");
  });

  it("rejects an invalid priority", () => {
    const result = todoItemFormSchema.safeParse({ ...minimal, priority: "Urgent" });
    expect(result.success).toBe(false);
  });

  it("coerces empty priority to null", () => {
    const parsed = todoItemFormSchema.parse({ ...minimal, priority: "" });
    expect(parsed.priority).toBeNull();
  });

  it("accepts a valid status including In Review", () => {
    const parsed = todoItemFormSchema.parse({ ...minimal, status: "In Review" });
    expect(parsed.status).toBe("In Review");
  });

  it("accepts In Progress status", () => {
    const parsed = todoItemFormSchema.parse({ ...minimal, status: "In Progress" });
    expect(parsed.status).toBe("In Progress");
  });

  it("rejects an invalid status", () => {
    const result = todoItemFormSchema.safeParse({ ...minimal, status: "Waiting" });
    expect(result.success).toBe(false);
  });

  it("accepts Daily Activity as projectOrActivity", () => {
    const parsed = todoItemFormSchema.parse({ ...minimal, projectOrActivity: "Daily Activity" });
    expect(parsed.projectOrActivity).toBe("Daily Activity");
  });

  it("rejects invalid projectOrActivity", () => {
    const result = todoItemFormSchema.safeParse({ ...minimal, projectOrActivity: "Activity" });
    expect(result.success).toBe(false);
  });

  it("coerces dailyActivityId from string to number", () => {
    const parsed = todoItemFormSchema.parse({ ...minimal, dailyActivityId: "7" });
    expect(parsed.dailyActivityId).toBe(7);
  });

  it("coerces empty dailyActivityId to null", () => {
    const parsed = todoItemFormSchema.parse({ ...minimal, dailyActivityId: "" });
    expect(parsed.dailyActivityId).toBeNull();
  });

  it("accepts null projectId (project-unscoped)", () => {
    const parsed = todoItemFormSchema.parse({ projectId: null, todoItem: "Global task" });
    expect(parsed.projectId).toBeNull();
  });
});

describe("updateTodoItemFormSchema", () => {
  it("coerces todoItemId and rowVer from FormData strings", () => {
    const parsed = updateTodoItemFormSchema.parse({
      ...minimal,
      todoItemId: "4",
      rowVer: "77",
    });
    expect(parsed.todoItemId).toBe(4);
    expect(parsed.rowVer).toBe(77);
  });
});

describe("isOverdue", () => {
  const yesterday = new Date(Date.now() - DAY_MS);
  const tomorrow = new Date(Date.now() + DAY_MS);

  // Today at UTC midnight — same calendar day as today, must NOT be overdue.
  const todayUtcMidnight = new Date();
  todayUtcMidnight.setUTCHours(0, 0, 0, 0);

  it("returns true when dueDate is in the past and status is not terminal", () => {
    expect(isOverdue({ DueDate: yesterday, Status: "In Progress" })).toBe(true);
  });

  it("returns false when dueDate is in the future", () => {
    expect(isOverdue({ DueDate: tomorrow, Status: "In Progress" })).toBe(false);
  });

  it("returns false when dueDate is exactly today at UTC midnight (not yet overdue)", () => {
    expect(isOverdue({ DueDate: todayUtcMidnight, Status: "In Progress" })).toBe(false);
  });

  it("returns false when status is Completed", () => {
    expect(isOverdue({ DueDate: yesterday, Status: "Completed" })).toBe(false);
  });

  it("returns false when status is Cancelled", () => {
    expect(isOverdue({ DueDate: yesterday, Status: "Cancelled" })).toBe(false);
  });

  it("returns true when status is In Review (not a terminal state)", () => {
    expect(isOverdue({ DueDate: yesterday, Status: "In Review" })).toBe(true);
  });

  it("returns false when DueDate is null", () => {
    expect(isOverdue({ DueDate: null, Status: "In Progress" })).toBe(false);
  });
});

describe("isApproachingDeadline", () => {
  const yesterday = new Date(Date.now() - DAY_MS);
  const tomorrow = new Date(Date.now() + DAY_MS);
  const inThreeDays = new Date(Date.now() + 3 * DAY_MS);

  it("returns true when due tomorrow", () => {
    expect(isApproachingDeadline({ DueDate: tomorrow, Status: "In Progress" })).toBe(true);
  });

  it("returns true when due in exactly 2 days (UTC midnight)", () => {
    const twoDaysUtc = new Date();
    twoDaysUtc.setUTCHours(0, 0, 0, 0);
    twoDaysUtc.setUTCDate(twoDaysUtc.getUTCDate() + 2);
    expect(isApproachingDeadline({ DueDate: twoDaysUtc, Status: "In Progress" })).toBe(true);
  });

  it("returns false when due in 3 days (beyond the 2-day window)", () => {
    expect(isApproachingDeadline({ DueDate: inThreeDays, Status: "In Progress" })).toBe(false);
  });

  it("returns false when already overdue (yesterday)", () => {
    expect(isApproachingDeadline({ DueDate: yesterday, Status: "In Progress" })).toBe(false);
  });

  it("returns false when status is Completed", () => {
    expect(isApproachingDeadline({ DueDate: tomorrow, Status: "Completed" })).toBe(false);
  });

  it("returns false when status is Cancelled", () => {
    expect(isApproachingDeadline({ DueDate: tomorrow, Status: "Cancelled" })).toBe(false);
  });

  it("returns false when DueDate is null", () => {
    expect(isApproachingDeadline({ DueDate: null, Status: "In Progress" })).toBe(false);
  });
});
