import { describe, expect, it } from "vitest";
import { dailyActivityFormSchema, updateDailyActivityFormSchema } from "./daily-activity-form";

/**
 * Daily Activity form contract ): FormData strings → repository input shape.
 * Covers date coercion, int coercion, vocab validation, optional → null transforms.
 */

const minimal = { projectId: "3" };

describe("dailyActivityFormSchema", () => {
  it("parses a minimal form — all optional fields become null", () => {
    const parsed = dailyActivityFormSchema.parse(minimal);
    expect(parsed.projectId).toBe(3);
    expect(parsed.task).toBeNull();
    expect(parsed.requester).toBeNull();
    expect(parsed.activityStatusId).toBeNull();
    expect(parsed.progress).toBeNull();
    expect(parsed.timeSpent).toBeNull();
    expect(parsed.taskType).toBeNull();
    expect(parsed.contactMethod).toBeNull();
  });

  it("coerces a valid YYYY-MM-DD requestDate to a Date", () => {
    const parsed = dailyActivityFormSchema.parse({ ...minimal, requestDate: "2024-06-15" });
    expect(parsed.requestDate).toBeInstanceOf(Date);
    expect(parsed.requestDate?.toISOString().slice(0, 10)).toBe("2024-06-15");
  });

  it("rejects an invalid requestDate", () => {
    const result = dailyActivityFormSchema.safeParse({ ...minimal, requestDate: "not-a-date" });
    expect(result.success).toBe(false);
  });

  it("coerces empty-string requestDate to null", () => {
    const parsed = dailyActivityFormSchema.parse({ ...minimal, requestDate: "" });
    expect(parsed.requestDate).toBeNull();
  });

  it("coerces a valid timeSpent string to a number", () => {
    const parsed = dailyActivityFormSchema.parse({ ...minimal, timeSpent: "3" });
    expect(parsed.timeSpent).toBe(3);
  });

  it("rejects timeSpent out of range", () => {
    const result = dailyActivityFormSchema.safeParse({ ...minimal, timeSpent: "10000" });
    expect(result.success).toBe(false);
  });

  it("coerces empty timeSpent to null", () => {
    const parsed = dailyActivityFormSchema.parse({ ...minimal, timeSpent: "" });
    expect(parsed.timeSpent).toBeNull();
  });

  it("coerces a valid progress to a number", () => {
    const parsed = dailyActivityFormSchema.parse({ ...minimal, progress: "75" });
    expect(parsed.progress).toBe(75);
  });

  it("rejects progress > 100", () => {
    const result = dailyActivityFormSchema.safeParse({ ...minimal, progress: "101" });
    expect(result.success).toBe(false);
  });

  it("accepts a valid taskType", () => {
    const parsed = dailyActivityFormSchema.parse({ ...minimal, taskType: "Technical" });
    expect(parsed.taskType).toBe("Technical");
  });

  it("rejects an invalid taskType", () => {
    const result = dailyActivityFormSchema.safeParse({ ...minimal, taskType: "Hacking" });
    expect(result.success).toBe(false);
  });

  it("coerces empty taskType to null", () => {
    const parsed = dailyActivityFormSchema.parse({ ...minimal, taskType: "" });
    expect(parsed.taskType).toBeNull();
  });

  it("accepts a valid contactMethod", () => {
    const parsed = dailyActivityFormSchema.parse({ ...minimal, contactMethod: "Email" });
    expect(parsed.contactMethod).toBe("Email");
  });

  it("coerces activityStatusId from string to number", () => {
    const parsed = dailyActivityFormSchema.parse({ ...minimal, activityStatusId: "2" });
    expect(parsed.activityStatusId).toBe(2);
  });

  it("coerces empty activityStatusId to null", () => {
    const parsed = dailyActivityFormSchema.parse({ ...minimal, activityStatusId: "" });
    expect(parsed.activityStatusId).toBeNull();
  });

  it("trims and preserves task text", () => {
    const parsed = dailyActivityFormSchema.parse({ ...minimal, task: "  Write tests  " });
    expect(parsed.task).toBe("Write tests");
  });
});

describe("updateDailyActivityFormSchema", () => {
  it("coerces dailyActivityId and rowVer from FormData strings", () => {
    const parsed = updateDailyActivityFormSchema.parse({
      ...minimal,
      dailyActivityId: "7",
      rowVer: "100",
    });
    expect(parsed.dailyActivityId).toBe(7);
    expect(parsed.rowVer).toBe(100);
  });
});
