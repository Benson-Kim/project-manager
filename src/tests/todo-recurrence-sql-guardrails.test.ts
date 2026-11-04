import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALL_WEEKDAYS,
  CALENDAR_MAX_DAYS,
  MONTH_MODES,
  ORDINALS,
  RECURRENCE_MAX_COUNT,
  REPEAT_UNITS,
} from "@/modules/todo-items/recurrence";
import { RECURRENCE_ERRORS } from "@/modules/todo-items/schemas/todo-recurrence";

/**
 * Recurring to-dos (ADR-0059) keep their limits in two places: the TS module the form and the
 * expansion use, and the migration's CHECKs and the procs. A limit changed on one side only would
 * let the form offer what the database refuses, or a window the expansion was never sized for.
 */
const read = (...path: string[]) => readFileSync(join(...path), "utf8");
const migration = read("db", "migrations", "061_todo_recurrence.sql");
const proc = (name: string) => read("db", "procs", "todo-item", `${name}.sql`);
const quoted = (values: readonly (string | number)[]) =>
  values.map((v) => (typeof v === "string" ? `N'${v}'` : String(v))).join(", ");

describe("recurring to-dos: TS limits match the database", () => {
  it("the calendar window is the same length in the proc", () => {
    expect(proc("usp_Todo_ListCalendar")).toContain(
      `DATEDIFF(DAY, @From, @To) + 1 > ${CALENDAR_MAX_DAYS}`,
    );
  });

  it("the repeat interval and the count ending share one range", () => {
    expect(migration).toContain(`CHECK (RepeatEvery BETWEEN 1 AND ${RECURRENCE_MAX_COUNT})`);
    expect(migration).toContain(`CHECK (EndsAfter BETWEEN 1 AND ${RECURRENCE_MAX_COUNT})`);
    const set = proc("usp_TodoRecurrence_Set");
    expect(set).toContain(`@RepeatEvery NOT BETWEEN 1 AND ${RECURRENCE_MAX_COUNT}`);
    expect(set).toContain(`@EndsAfter NOT BETWEEN 1 AND ${RECURRENCE_MAX_COUNT}`);
  });

  it("the units, month modes, ordinals and weekday mask are the same lists", () => {
    const set = proc("usp_TodoRecurrence_Set");
    for (const source of [migration, set]) {
      expect(source).toContain(`IN (${quoted(REPEAT_UNITS)})`);
      expect(source).toContain(`IN (${quoted(MONTH_MODES)})`);
      expect(source).toContain(`IN (${quoted(ORDINALS)})`);
      expect(source).toContain(`BETWEEN 1 AND ${ALL_WEEKDAYS}`);
    }
  });

  it("the form refuses a rule in the procs' own words", () => {
    const procs = proc("usp_TodoRecurrence_Set") + proc("usp_TodoOccurrence_Set");
    for (const message of Object.values(RECURRENCE_ERRORS))
      expect(procs, message).toContain(`N'VALIDATION:${message}'`);
  });

  it("the rule read returns what Set returns, so one row schema reads both", () => {
    const columns = (name: string) =>
      /SELECT r\.TodoItemId,[\s\S]*?\bFROM app\.TodoRecurrence r\b/.exec(proc(name))?.[0];
    const set = columns("usp_TodoRecurrence_Set");
    expect(set).toBeDefined();
    expect(columns("usp_TodoRecurrence_GetById")).toBe(set);
  });

  it("an occurrence write never moves the series' RowVer", () => {
    expect(proc("usp_TodoOccurrence_Set")).not.toMatch(/UPDATE\s+app\.TodoItem\b/);
  });

  it("the list marks each series from its rule, for the Repeats badge", () => {
    expect(proc("usp_TodoItem_List")).toMatch(
      /EXISTS \(SELECT 1 FROM app\.TodoRecurrence r WHERE r\.TodoItemId = TodoItem\.TodoItemId\)[\s\S]*?AS Repeats,/,
    );
  });

  it("editing a series' start date is refused in Set's own words, and drops future rows as Set does", () => {
    const set = proc("usp_TodoRecurrence_Set");
    const update = proc("usp_TodoItem_Update");
    for (const sentence of [
      "N'VALIDATION:A repeating to-do needs a start date'",
      "N'VALIDATION:The repeat cannot end before the to-do starts'",
      "WHERE TodoItemId = @TodoItemId AND OccursAt >= @Now;",
    ]) {
      expect(set).toContain(sentence);
      expect(update).toContain(sentence);
    }
  });
});
