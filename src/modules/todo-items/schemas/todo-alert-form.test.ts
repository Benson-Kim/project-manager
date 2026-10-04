import { describe, expect, it } from "vitest";
import { createTodoAlertInput } from "./todo-alert";
import { todoAlertFormSchema, updateTodoAlertFormSchema } from "./todo-alert-form";

/**
 * TodoAlert form contract: FormData strings → repository input shape.
 * Covers date, time, vocab, optional int coercion.
 */

// Active alert — alertDay is required; dismissed alerts may omit it.
const minimal = { todoItemId: "5", isDismissed: "false", alertDay: "2025-11-01" };
const minimalDismissed = { todoItemId: "5", isDismissed: "true" };

describe("todoAlertFormSchema", () => {
  it("parses a minimal active alert form (day required)", () => {
    const parsed = todoAlertFormSchema.parse(minimal);
    expect(parsed.todoItemId).toBe(5);
    expect(parsed.isDismissed).toBe(false);
    expect(parsed.alertDay).toBeInstanceOf(Date);
    expect(parsed.alertTime).toBeNull();
    expect(parsed.repeatUnit).toBeNull();
    expect(parsed.repeatInterval).toBeNull();
    expect(parsed.maxSnoozeCount).toBeNull();
  });

  it("rejects an active alert with no alertDay", () => {
    const result = todoAlertFormSchema.safeParse({ todoItemId: "5", isDismissed: "false" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["alertDay"]);
    }
  });

  it("allows a dismissed alert with no alertDay (never becomes due anyway)", () => {
    const parsed = todoAlertFormSchema.parse(minimalDismissed);
    expect(parsed.isDismissed).toBe(true);
    expect(parsed.alertDay).toBeNull();
  });

  it("coerces alertDay from YYYY-MM-DD string", () => {
    const parsed = todoAlertFormSchema.parse(minimal);
    expect(parsed.alertDay).toBeInstanceOf(Date);
    expect(parsed.alertDay?.toISOString().slice(0, 10)).toBe("2025-11-01");
  });

  it("rejects an invalid alertDay", () => {
    const result = todoAlertFormSchema.safeParse({ ...minimal, alertDay: "not-a-date" });
    expect(result.success).toBe(false);
  });

  it("accepts a valid HH:mm alertTime", () => {
    const parsed = todoAlertFormSchema.parse({ ...minimal, alertTime: "09:30" });
    expect(parsed.alertTime).toBe("09:30");
  });

  it("accepts a HH:mm:ss alertTime", () => {
    const parsed = todoAlertFormSchema.parse({ ...minimal, alertTime: "14:00:00" });
    expect(parsed.alertTime).toBe("14:00:00");
  });

  it("rejects an invalid alertTime format", () => {
    const result = todoAlertFormSchema.safeParse({ ...minimal, alertTime: "9am" });
    expect(result.success).toBe(false);
  });

  it.each(["24:00", "29:99", "23:60", "00:00:60", "25:00:00"])(
    "rejects out-of-range alertTime %s",
    (alertTime) => {
      const result = todoAlertFormSchema.safeParse({ ...minimal, alertTime });
      expect(result.success).toBe(false);
    },
  );

  it("accepts boundary alertTime values", () => {
    expect(todoAlertFormSchema.safeParse({ ...minimal, alertTime: "00:00" }).success).toBe(true);
    expect(todoAlertFormSchema.safeParse({ ...minimal, alertTime: "23:59" }).success).toBe(true);
    expect(todoAlertFormSchema.safeParse({ ...minimal, alertTime: "23:59:59" }).success).toBe(true);
  });

  it("accepts a valid repeatUnit", () => {
    const parsed = todoAlertFormSchema.parse({ ...minimal, repeatUnit: "Day" });
    expect(parsed.repeatUnit).toBe("Day");
  });

  it("rejects an invalid repeatUnit", () => {
    const result = todoAlertFormSchema.safeParse({ ...minimal, repeatUnit: "Minute" });
    expect(result.success).toBe(false);
  });

  it("coerces repeatInterval from string", () => {
    const parsed = todoAlertFormSchema.parse({ ...minimal, repeatInterval: "3" });
    expect(parsed.repeatInterval).toBe(3);
  });

  it("coerces empty repeatInterval to null", () => {
    const parsed = todoAlertFormSchema.parse({ ...minimal, repeatInterval: "" });
    expect(parsed.repeatInterval).toBeNull();
  });

  it("accepts zero as the maximum snooze count", () => {
    const parsed = todoAlertFormSchema.parse({ ...minimal, maxSnoozeCount: "0" });
    expect(parsed.maxSnoozeCount).toBe(0);
  });

  it("rejects a fractional maximum snooze count", () => {
    const result = todoAlertFormSchema.safeParse({
      ...minimal,
      maxSnoozeCount: "1.5",
    });
    expect(result.success).toBe(false);
  });

  it("normalizes valid snooze options and removes duplicates", () => {
    const parsed = todoAlertFormSchema.parse({
      ...minimal,
      snoozeOptions: " 05, 10,5, 1440 ",
    });
    expect(parsed.snoozeOptions).toBe("5,10,1440");
  });

  it.each(["abc", "0", "2000", "5,,10", "1.5"])(
    "rejects invalid snooze options %s",
    (snoozeOptions) => {
      const result = todoAlertFormSchema.safeParse({ ...minimal, snoozeOptions });
      expect(result.success).toBe(false);
    },
  );

  it("coerces empty snooze options to null", () => {
    const parsed = todoAlertFormSchema.parse({ ...minimal, snoozeOptions: "" });
    expect(parsed.snoozeOptions).toBeNull();
  });

  it("coerces isDismissed true string", () => {
    const parsed = todoAlertFormSchema.parse({ ...minimal, isDismissed: "true" });
    expect(parsed.isDismissed).toBe(true);
  });
});

describe("updateTodoAlertFormSchema", () => {
  it("coerces todoAlertId and rowVer from FormData strings", () => {
    const parsed = updateTodoAlertFormSchema.parse({
      ...minimal,
      todoAlertId: "9",
      rowVer: "55",
    });
    expect(parsed.todoAlertId).toBe(9);
    expect(parsed.rowVer).toBe(55);
  });
});

describe("createTodoAlertInput", () => {
  it("accepts zero snoozes and normalizes options at the repository boundary", () => {
    const parsed = createTodoAlertInput.parse({
      todoItemId: 5,
      maxSnoozeCount: 0,
      snoozeOptions: " 5, 10, 5 ",
      isDismissed: false,
    });

    expect(parsed.maxSnoozeCount).toBe(0);
    expect(parsed.snoozeOptions).toBe("5,10");
  });
});
