import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ID_BOUND_LISTS, LOOKUP_LISTS } from "@/lib/lookup-lists";

/**
 * Guardrail (ADR-0022): one list registry, four places that must agree —
 *   1. LOOKUP_LISTS in src/lib/lookup-lists.ts (what the app reads),
 *   2. the lists migration 018 seeds,
 *   3. the rename cascade in dbo.usp_LookupList_Set (text-bound lists) plus
 *      ID_BOUND_LISTS (lists records reference by option id),
 *   4. the list checks in the Create/Update procs.
 * A list added in one place and forgotten in another fails here.
 */
const read = (...path: string[]) => readFileSync(join(...path), "utf8");

// Lists are seeded by 018 and by later migrations that add one (021: team titles).
const migration = ["018_lookup_list.sql", "021_project_permissions.sql"]
  .map((file) => read("db", "migrations", file))
  .join(String.fromCharCode(10));
const setProc = read("db", "procs", "lookup-list", "usp_LookupList_Set.sql");

const seeded = [...migration.matchAll(/\(N'([a-z-]+\.[a-z-]+)',\s*N'([^']+)',\s*\d+,\s*([01])\)/g)];
const seededKeys = new Set(seeded.map((m) => m[1]));
const lockedSeeds = seeded.filter((m) => m[3] === "1").map((m) => `${m[1]}:${m[2]}`);
const cascadeKeys = new Set(
  [...setProc.matchAll(/IF @ListKey = N'([a-z-]+\.[a-z-]+)'/g)].map((m) => m[1]),
);

const procCalls = readdirSync(join("db", "procs"), { recursive: true, encoding: "utf8" })
  .filter((f) => f.endsWith(".sql"))
  .flatMap((f) =>
    [
      ...read("db", "procs", f).matchAll(
        /EXEC dbo\.usp_LookupList_Assert(Label|Option)\s+@ListKey = N'([^']+)'/g,
      ),
    ].map((m) => ({ file: f, kind: m[1], key: m[2] })),
  );

describe("managed dropdown lists stay in step (ADR-0022)", () => {
  it("the migrations seed exactly the registered lists", () => {
    expect([...seededKeys].sort()).toEqual([...LOOKUP_LISTS].sort());
  });

  it("every text-bound list cascades renames to its records; id-bound lists need no cascade", () => {
    const textBound = LOOKUP_LISTS.filter((key) => !ID_BOUND_LISTS.includes(key));
    expect([...cascadeKeys].sort()).toEqual([...textBound].sort());
  });

  it("procs check values only against registered lists, by label or by id as stored", () => {
    expect(procCalls.length).toBeGreaterThan(0);
    for (const call of procCalls) {
      expect(LOOKUP_LISTS, call.file).toContain(call.key);
      const byId = ID_BOUND_LISTS.includes(call.key as (typeof LOOKUP_LISTS)[number]);
      expect(call.kind, `${call.file} ${call.key}`).toBe(byId ? "Option" : "Label");
    }
  });

  it("every registered list is checked by at least one proc", () => {
    const checked = new Set(procCalls.map((c) => c.key));
    expect([...checked].sort()).toEqual([...LOOKUP_LISTS].sort());
  });

  it("locks exactly the labels the code reads by name", () => {
    expect(lockedSeeds.sort()).toEqual(
      [
        // statusToCompletion() / isOverdue() — src/modules/key-deliverables/schemas/key-deliverable.ts
        "key-deliverable.status:In Progress",
        "key-deliverable.status:Completed",
        "key-deliverable.status:On Hold",
        "key-deliverable.status:Cancelled",
        // usp_Todo_BuildFromDailyActivity, the alert procs, isOverdue()/isApproachingDeadline()
        "todo-item.status:Not Started",
        "todo-item.status:Completed",
        "todo-item.status:Cancelled",
        // the two kinds of record the module holds
        "assumption-constraint.type:Assumption",
        "assumption-constraint.type:Constraint",
        // usp_Project_Create gives a new project's creator this title (migration 021)
        "project-assignee.title:Project manager",
      ].sort(),
    );
  });
});
