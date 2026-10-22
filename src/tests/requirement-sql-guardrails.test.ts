import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  NEED_TYPES,
  REQUIREMENT_TYPES,
  SOLUTION_TYPES,
  type RequirementType,
} from "@/modules/requirements/schemas/requirement-types";

/**
 * Guardrail (ADR-0037): the requirement procs and migration 036 enforce the traceability rules
 * where they cannot be bypassed. This test reads the SQL text and fails when it drifts from the
 * TypeScript type catalog, when a write checks other rows before taking the project lock, when a
 * parsed JSON column could drop a null, or when application code names an internal helper proc.
 */
function sql(path: string): string {
  return readFileSync(path, "utf8");
}

const DIR = "db/procs/requirement";
const MIGRATION = "db/migrations/036_requirement_traceability.sql";
const WRITES = ["Create", "Update", "Move", "Unallocate", "Delete"] as const;

const procFiles = readdirSync(DIR)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => join(DIR, f));

/** Each requirement-type IN / NOT IN list must be exactly the full, need or solution set. */
describe("requirement type lists match the TypeScript catalog (ADR-0037)", () => {
  const sets: (readonly RequirementType[])[] = [REQUIREMENT_TYPES, NEED_TYPES, SOLUTION_TYPES];
  const canonical = new Set(sets.map((set) => [...set].sort().join(",")));
  const LIST = /@?RequirementType\s+(?:NOT\s+)?IN\s*\(([^)]*)\)/g;

  it.each([MIGRATION, ...procFiles])("%s uses only whole type sets", (path) => {
    const text = sql(path);
    for (const [, body] of text.matchAll(LIST)) {
      const codes = [...body.matchAll(/'(\w+)'/g)].map((m) => m[1]!).sort();
      expect(canonical, `${path}: IN (${body.trim()})`).toContain(codes.join(","));
    }
  });

  it("the catalog is the five known types", () => {
    expect([...REQUIREMENT_TYPES].sort()).toEqual(["BR", "FR", "NFR", "SR", "TR"]);
  });
});

/** A write cannot read another row for a check that could go stale before it writes. */
describe("requirement writes lock the project before their checks (ADR-0037)", () => {
  it.each(WRITES)("usp_Requirement_%s locks before its first INSERT/UPDATE/DELETE", (name) => {
    const text = sql(join(DIR, `usp_Requirement_${name}.sql`));
    const lock = text.indexOf("WITH (UPDLOCK, HOLDLOCK)");
    const firstDml = text.search(/\n\s*(INSERT|UPDATE|DELETE)\s/);
    expect(lock, name).toBeGreaterThan(0);
    expect(firstDml, name).toBeGreaterThan(lock);
  });

  it.each(["ReplaceTraces", "ReplaceAllocations"])(
    "helper usp_Requirement_%s refuses to run outside a transaction",
    (name) => {
      const text = sql(join(DIR, `usp_Requirement_${name}.sql`));
      expect(text).toMatch(/IF @@TRANCOUNT = 0\s*\n\s*THROW 50004/);
    },
  );
});

/** The links the app parses keep their null properties (LESSONS §26). */
describe("requirement JSON the app parses keeps nulls (ADR-0037)", () => {
  it("every FOR JSON column in ufn_Requirement_Links includes nulls", () => {
    const links = sql(join(DIR, "ufn_Requirement_Links.sql"));
    expect(links).toContain("FOR JSON PATH, INCLUDE_NULL_VALUES");
    expect(links.match(/FOR JSON PATH(?!, INCLUDE_NULL_VALUES)/g)).toBeNull();
  });
});

/** The helpers assert access themselves and are never a shadow write path from the app. A call
 *  passes the proc name to execProc as a quoted string; a comment or this test's own text is not a
 *  call, so the scan looks for the quoted form in application code only. */
describe("no application code calls a requirement helper proc (ADR-0037)", () => {
  const files = readdirSync("src", { recursive: true })
    .map(String)
    .filter(
      (f) => /\.(ts|tsx)$/.test(f) && !/(^|\/)tests\//.test(f) && !/\.test\.(ts|tsx)$/.test(f),
    );

  it("finds the application source tree", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it("no application file calls usp_Requirement_Replace*", () => {
    const offenders = files.filter((f) =>
      readFileSync(join("src", f), "utf8").includes('"usp_Requirement_Replace'),
    );
    expect(offenders).toEqual([]);
  });
});
