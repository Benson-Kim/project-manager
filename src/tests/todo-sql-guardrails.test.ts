import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The to-do procs against the row contract the app parses.
 *
 * Migration 047 added app.TodoItem.Assignee, and `todoItemRowSchema` requires
 * it. Five procs answer a whole to-do row, two of which — Reorder and
 * BuildFromDailyActivity — are easy to miss, because neither is reached from
 * the sheet that the column was added to. Both were missed, and only
 * Playwright found them: a row short of a required column fails the zod parse
 * at the repository boundary, which is a 500, not a missing cell.
 *
 * So this is the check that costs a minute instead of a CI round trip: every
 * proc that returns a to-do row returns every column the schema demands.
 */

const DIR = join("db", "procs", "todo-item");

const PROCS = new Map(
  readdirSync(DIR)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => [f.replace(/\.sql$/, ""), readFileSync(join(DIR, f), "utf8")]),
);

function sql(name: string): string {
  const text = PROCS.get(name);
  if (!text) throw new Error(`missing proc ${name}`);
  return text;
}

/** The procs whose result set the repository parses as a full to-do row. */
const ROW_PROCS = [
  "usp_TodoItem_Create",
  "usp_TodoItem_Update",
  "usp_TodoItem_GetById",
  "usp_TodoItem_List",
  "usp_TodoItem_Reorder",
  "usp_Todo_BuildFromDailyActivity",
];

/**
 * The columns of app.TodoItem that `todoItemRowSchema` requires and that are
 * selected by name. The audit and identity columns are added by each proc's
 * own tail, and ProjectOrActivity/SortKey are not spelled the same everywhere.
 */
const REQUIRED = [
  "TodoItem",
  "StartDate",
  "DueDate",
  "Priority",
  "Status",
  "Assignee",
  "Notes",
] as const;

describe("to-do SQL guardrails", () => {
  it.each(ROW_PROCS)("%s returns every column the row schema requires", (name) => {
    const text = sql(name);
    for (const column of REQUIRED) {
      expect(text, `${name} is missing [${column}]`).toContain(`[${column}]`);
    }
  });

  it("the delete snapshots the same columns it is deleting", () => {
    const text = sql("usp_TodoItem_Delete");
    for (const column of REQUIRED) {
      expect(text, `delete audit is missing [${column}]`).toContain(`[${column}]`);
    }
  });

  it("a written assignee is folded from empty text to nobody", () => {
    for (const name of ["usp_TodoItem_Create", "usp_TodoItem_Update"]) {
      expect(sql(name), name).toMatch(/NULLIF\(LTRIM\(RTRIM\(@Assignee\)\), N''\)/);
    }
  });

  it("the list searches the assignee with the escape every search column uses", () => {
    const text = sql("usp_TodoItem_List");
    expect(text).toMatch(/\[Assignee\] LIKE N'%' \+ @Search \+ N'%' ESCAPE N'\\'/);
  });
});
