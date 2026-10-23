import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ListSort } from "@/lib/list-params";
import { ASSUMPTION_CONSTRAINT_SORT } from "@/modules/assumptions-constraints/schemas/assumption-constraint";
import { DAILY_ACTIVITY_SORT } from "@/modules/daily-activities/schemas/daily-activity";
import { KEY_DELIVERABLE_SORT } from "@/modules/key-deliverables/schemas/key-deliverable";
import { KEYWORD_SORT } from "@/modules/keywords/schemas/keyword";
import { MEETING_SORT } from "@/modules/meetings/schemas/meeting";
import { NOTE_SORT } from "@/modules/notes/schemas/note";
import { PARKING_LOT_SORT } from "@/modules/parking-lot/schemas/parking-lot-item";
import { PROJECT_SORT } from "@/modules/projects/schemas/project";
import { QUESTION_ANSWER_SORT } from "@/modules/questions-answers/schemas/question-answer";
import { REQUIREMENT_SORT } from "@/modules/requirements/schemas/requirement";
import { STAKEHOLDER_SORT } from "@/modules/stakeholders/schemas/stakeholder";
import { SUPPLIER_SORT } from "@/modules/suppliers/schemas/supplier";
import { TODO_ITEM_SORT } from "@/modules/todo-items/schemas/todo-item";

/**
 * Guardrail: a column header offers an order only if the proc applies it. The
 * list procs compare `@SortBy` inside `ORDER BY CASE` (ADR-0016), so a token
 * they do not name falls through to the tie-breaker — the rows come back in the
 * default order while the arrow claims otherwise, and nothing throws. Each
 * module's `ListSort` is therefore read against the ORDER BY of its own proc.
 *
 * The proc's own executable shape is read, never its header comment: a proc
 * that documents its whitelist contains every token as prose too (LESSONS §39).
 */
const MODULES: Array<[string, ListSort, string]> = [
  [
    "assumptions-constraints",
    ASSUMPTION_CONSTRAINT_SORT,
    "db/procs/assumption-constraint/usp_AssumptionConstraint_List.sql",
  ],
  ["daily-activities", DAILY_ACTIVITY_SORT, "db/procs/daily-activity/usp_DailyActivity_List.sql"],
  [
    "key-deliverables",
    KEY_DELIVERABLE_SORT,
    "db/procs/key-deliverable/usp_KeyDeliverable_List.sql",
  ],
  ["keywords", KEYWORD_SORT, "db/procs/keyword/usp_Keyword_List.sql"],
  ["meetings", MEETING_SORT, "db/procs/meeting/usp_Meeting_List.sql"],
  ["notes", NOTE_SORT, "db/procs/note/usp_Note_List.sql"],
  ["parking-lot", PARKING_LOT_SORT, "db/procs/parking-lot-item/usp_ParkingLotItem_List.sql"],
  ["projects", PROJECT_SORT, "db/procs/project/usp_Project_List.sql"],
  [
    "questions-answers",
    QUESTION_ANSWER_SORT,
    "db/procs/question-answer/usp_QuestionAnswer_List.sql",
  ],
  ["requirements", REQUIREMENT_SORT, "db/procs/requirement/usp_Requirement_List.sql"],
  ["stakeholders", STAKEHOLDER_SORT, "db/procs/stakeholder/usp_Stakeholder_List.sql"],
  ["suppliers", SUPPLIER_SORT, "db/procs/supplier/usp_Supplier_List.sql"],
  ["todo-items", TODO_ITEM_SORT, "db/procs/todo-item/usp_TodoItem_List.sql"],
];

/** The SQL with its line comments removed, so prose cannot satisfy an assertion. */
function statements(path: string): string {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
}

/** The tokens one proc's ORDER BY actually compares `@SortBy` against. */
function sortTokens(path: string): string[] {
  const sql = statements(path);
  const found = sql.matchAll(/@SortBy\s*=\s*N'([A-Za-z0-9_]+)'/g);
  return [...new Set([...found].map((m) => m[1] as string))].sort();
}

describe("a module's sortable columns are exactly the ones its list proc applies", () => {
  it("reads every module that offers sorting", () => {
    // Thirteen today. The fourteenth list (objectives) declares no ListSort
    // because its proc orders by ObjectiveId alone; adding one adds a row here.
    expect(MODULES.length).toBe(13);
    for (const [, , path] of MODULES) expect(sortTokens(path).length).toBeGreaterThan(0);
  });

  it.each(MODULES)("%s matches %o against its proc", (_name, sort, path) => {
    expect([...sort.columns].sort()).toEqual(sortTokens(path));
  });

  it.each(MODULES)("%s names a default its proc applies", (_name, sort, path) => {
    if (sort.default === null) return;
    expect(sortTokens(path)).toContain(sort.default);
  });

  it.each(MODULES)("%s lists each column once", (_name, sort) => {
    expect(new Set(sort.columns).size).toBe(sort.columns.length);
  });
});

describe("every list view hands the DataView its module's sort contract", () => {
  // Without the prop the headers show no arrows at all, which is how a list
  // ships unsortable without anything failing.
  const views = readdirSync("src/modules", { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const dir = join("src/modules", entry.name, "components");
      if (!existsSync(dir)) return [];
      return readdirSync(dir)
        .map((name) => join(dir, name))
        .filter((path) => path.endsWith(".tsx"))
        .filter((path) => readFileSync(path, "utf8").includes("<DataView"));
    });

  /** The one list whose proc orders by its id alone, so it has nothing to offer. */
  const NO_SORTABLE_COLUMN = ["src/modules/objectives/components/objectives-view.tsx"];

  it("finds every list view", () => {
    expect(views.length).toBe(MODULES.length + NO_SORTABLE_COLUMN.length);
  });

  it.each(views)("%s", (path) => {
    const source = readFileSync(path, "utf8");
    if (NO_SORTABLE_COLUMN.includes(path)) {
      expect(source).not.toContain("sort={");
    } else {
      expect(source).toMatch(/\n\s+sort=\{[A-Z_]+\}\n/);
    }
  });
});

describe("the ORDER BY reader", () => {
  it("finds both directions of one token as one column", () => {
    // Every proc writes a token twice, once per direction.
    expect(sortTokens("db/procs/keyword/usp_Keyword_List.sql")).toEqual(["Keyword"]);
  });

  it("ignores a token that appears only in a comment", () => {
    const real = sortTokens("db/procs/objective/usp_Objective_List.sql");
    // Its header says "Sort whitelist: (default ObjectiveId only)" and its ORDER BY
    // compares nothing, so a reader that matched prose would not come back empty.
    expect(real).toEqual([]);
  });
});
