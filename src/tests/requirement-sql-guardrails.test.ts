import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  NEED_TYPES,
  REQUIREMENT_TYPES,
  SOLUTION_TYPES,
  type RequirementType,
} from "@/modules/requirements/schemas/requirement-types";
import { MOSCOW } from "@/modules/requirements/schemas/moscow";

/**
 * Guardrail (ADR-0037): the requirement procs and migration 036 enforce the traceability rules
 * where they cannot be bypassed. This test reads the SQL text and fails when it drifts from the
 * TypeScript type catalog, when a write checks other rows before taking the project lock, when a
 * parsed JSON column could drop a null, or when application code names an internal helper proc.
 */
/** LF whatever the checkout: Windows with core.autocrlf writes the procs with CRLF. */
function sql(path: string): string {
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}

const DIR = "db/procs/requirement";
const MIGRATION = "db/migrations/036_requirement_traceability.sql";
const WRITES = [
  "Create",
  "Update",
  "Move",
  "Unallocate",
  "Delete",
  "SetMoSCoW",
  "SetPlanning",
] as const;

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

/** CK_Requirement_MoSCoW and the chips offer the same four codes (ADR-0052). */
describe("the MoSCoW check lists the TypeScript codes (ADR-0052)", () => {
  const m = sql("db/migrations/051_plan_views.sql");

  it("CK_Requirement_MoSCoW allows exactly MOSCOW, and NULL", () => {
    const check = m.match(/CK_Requirement_MoSCoW\s+CHECK\s*\(([^;]*)\);/);
    expect(check).not.toBeNull();
    const body = check![1]!;
    expect(body).toContain("[MoSCoW] IS NULL OR");
    const codes = [...body.matchAll(/'(\w)'/g)].map((c) => c[1]!);
    expect(codes.sort()).toEqual([...MOSCOW].sort());
  });

  it("every write that takes a planning field checks it under the lock (ADR-0052)", () => {
    for (const name of ["Create", "SetMoSCoW", "SetPlanning"]) {
      const text = sql(join(DIR, `usp_Requirement_${name}.sql`));
      const lock = text.indexOf("WITH (UPDLOCK, HOLDLOCK)");
      const check = text.indexOf("EXEC dbo.usp_Requirement_AssertPlanning");
      expect(lock, name).toBeGreaterThan(0);
      expect(check, name).toBeGreaterThan(lock);
    }
  });

  it("every proc that writes MoSCoW checks it against the same codes", () => {
    for (const file of procFiles) {
      const text = sql(file);
      for (const [, body] of text.matchAll(/@MoSCoW\s+(?:NOT\s+)?IN\s*\(([^)]*)\)/g)) {
        const codes = [...body.matchAll(/'(\w)'/g)].map((c) => c[1]!);
        expect(codes.sort(), file).toEqual([...MOSCOW].sort());
      }
    }
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

  it.each(["ReplaceTraces", "ReplaceAllocations", "AssertPlanning"])(
    "helper usp_Requirement_%s refuses to run outside a transaction",
    (name) => {
      const text = sql(join(DIR, `usp_Requirement_${name}.sql`));
      expect(text).toMatch(/IF @@TRANCOUNT = 0\s*\n\s*THROW 50004/);
    },
  );
});

/** The register's search is a parameter, and every wildcard in it stays literal.
 *  `src/tests/list-search-escape.test.ts` holds the same rule for every searching proc. */
describe("the register's search carries no pattern syntax (ADR-0037)", () => {
  const list = sql(join(DIR, "usp_Requirement_List.sql"));

  it("escapes the LIKE wildcards before the search reaches the predicate", () => {
    expect(list).toContain(
      "REPLACE(REPLACE(REPLACE(REPLACE(@Search, N'\\', N'\\\\'), N'%', N'\\%'), N'_', N'\\_'), N'[', N'\\[')",
    );
    const likes = list.match(/LIKE N'%'[^\n]*/g) ?? [];
    expect(likes).toHaveLength(1);
    for (const like of likes) expect(like).toContain("ESCAPE N'\\'");
  });

  it("searches on the parameter, never on a built string", () => {
    expect(list).toContain("Requirement LIKE N'%' + @Search + N'%' ESCAPE N'\\'");
  });
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

/**
 * Sub-requirements (ADR-0048). Migration 047 shipped with two procs short of a required column and
 * CI found it, not a test; this is the same shape of check session 12 added for to-dos, applied to
 * the requirement row before the next column can repeat it.
 */
const MIGRATION_048 = "db/migrations/048_requirement_sub_requirements.sql";

/** The procs whose result set the repository parses as a full requirement row. */
const ROW_PROCS = ["usp_Requirement_List", "usp_Requirement_GetById"] as const;

describe("every proc answering a requirement row answers with every column (ADR-0048)", () => {
  // requirementRowSchema requires these and they are selected by name. Create and Update are not
  // listed: both answer by EXEC-ing GetById, so they cannot drift from it.
  const REQUIRED = [
    "Ref",
    "SortPath",
    "Depth",
    "ChildCount",
    "Number",
    "RequirementType",
    "ParentRequirementId",
    "[MoSCoW]",
    "AcceptanceCriteria",
    "EstimateDays",
    "OwnerStakeholderId",
    "OwnerName",
  ] as const;

  it.each(ROW_PROCS)("%s names every column the row schema requires", (name) => {
    const text = sql(join(DIR, `${name}.sql`));
    for (const column of REQUIRED) {
      expect(text, `${name} is missing ${column}`).toContain(column);
    }
  });

  it("Create and Update answer through GetById rather than selecting a row of their own", () => {
    for (const name of ["Create", "Update"]) {
      const text = sql(join(DIR, `usp_Requirement_${name}.sql`));
      expect(text, name).toContain("EXEC dbo.usp_Requirement_GetById");
    }
  });

  it("the WBS chip reads the same reference the register does", () => {
    const gantt = sql("db/procs/key-deliverable/usp_KeyDeliverable_GanttData.sql");
    expect(gantt).toContain("dbo.ufn_Requirement_AncestorPath");
    // A number would let the Gantt label a sub-requirement FR-1 while the register calls it FR-1.2.
    expect(gantt).not.toMatch(/r\.Number\s+AS \[?number\]?/);
  });
});

describe("the reference has one definition (ADR-0048)", () => {
  const path = sql(join(DIR, "ufn_Requirement_AncestorPath.sql"));

  it("pads every level to the ten digits CK_Requirement_Number allows, so 1.2 sorts before 1.10", () => {
    expect(path).toContain("RIGHT(CONCAT('0000000000', CAST(c.Number AS VARCHAR(10))), 10)");
  });

  it("bounds its own recursion, as ufn_KeyDeliverable_Ancestors does", () => {
    expect(path).toMatch(/WHERE c\.Distance < \d+/);
  });

  it("every reader of a reference goes through it, and none composes one", () => {
    for (const file of procFiles) {
      const text = sql(file);
      if (!/\bRef\b|\[?number\]?\s*,/.test(text)) continue;
      // The only place a reference is built is the function itself.
      if (file.endsWith("ufn_Requirement_AncestorPath.sql")) continue;
      expect(text, file).not.toMatch(/CONCAT\(\s*\w*\.?RequirementType\s*,\s*'-'/);
    }
  });
});

describe("migration 048 holds the tree's invariants where they cannot be bypassed", () => {
  const m = sql(MIGRATION_048);

  it("keeps a child in its parent's project with a composite foreign key", () => {
    expect(m).toContain("FOREIGN KEY (ParentRequirementId, ProjectId)");
    expect(m).toContain("REFERENCES app.Requirement (RequirementId, ProjectId)");
  });

  it("refuses a row that is its own parent, as a table constraint (error 8141)", () => {
    expect(m).toContain("CK_Requirement_NotSelfParent");
    expect(m).toContain("CHECK (ParentRequirementId <> RequirementId)");
  });

  it("makes a number unique per parent, and keeps the Gantt stamp's leading column and INCLUDE", () => {
    expect(m).toContain(
      "ON app.Requirement (ProjectId, RequirementType, ParentRequirementId, Number)",
    );
    expect(m).toContain("INCLUDE (IsDeleted, IsMet, RowVer)");
  });

  it("is idempotent: every object it adds is guarded", () => {
    const creates = m.match(/^\s*(ALTER TABLE|CREATE (UNIQUE )?INDEX|DROP INDEX)/gm) ?? [];
    expect(creates.length).toBeGreaterThan(0);
    expect(m.match(/IF (NOT )?EXISTS|IF COL_LENGTH/g)?.length ?? 0).toBeGreaterThanOrEqual(
      creates.length,
    );
  });
});

describe("the write procs own the invariants a constraint cannot express (ADR-0048)", () => {
  it("numbers a new requirement within its parent, not across its type", () => {
    const create = sql(join(DIR, "usp_Requirement_Create.sql"));
    expect(create).toContain(
      "((@ParentRequirementId IS NULL AND ParentRequirementId IS NULL)\n" +
        "                       OR ParentRequirementId = @ParentRequirementId)",
    );
  });

  it("takes a child's type from its parent rather than from the caller", () => {
    expect(sql(join(DIR, "usp_Requirement_Create.sql"))).toContain(
      "SET @RequirementType = @ParentType;",
    );
  });

  it("caps the depth under the project lock, since depth spans rows", () => {
    const create = sql(join(DIR, "usp_Requirement_Create.sql"));
    const lock = create.indexOf("WITH (UPDLOCK, HOLDLOCK)");
    const depth = create.indexOf("@ParentDepth >= 3");
    expect(lock).toBeGreaterThan(0);
    expect(depth).toBeGreaterThan(lock);
  });

  it("refuses to delete a requirement that still has children, under the lock", () => {
    const del = sql(join(DIR, "usp_Requirement_Delete.sql"));
    const lock = del.indexOf("WITH (UPDLOCK, HOLDLOCK)");
    const refusal = del.indexOf("WHERE ParentRequirementId = @RequirementId AND IsDeleted = 0");
    expect(refusal).toBeGreaterThan(lock);
    expect(del).toMatch(/THROW 50004, N'VALIDATION:Delete the sub-requirements/);
  });

  it("refuses a type change on a child and on a row that still has children", () => {
    const update = sql(join(DIR, "usp_Requirement_Update.sql"));
    expect(update).toMatch(/THROW 50004, N'VALIDATION:A sub-requirement takes its type/);
    expect(update).toMatch(/THROW 50004, N'VALIDATION:Remove the sub-requirements/);
  });

  it("re-parents nowhere: only Create ever writes ParentRequirementId", () => {
    for (const file of procFiles) {
      if (file.endsWith("usp_Requirement_Create.sql")) continue;
      expect(sql(file), file).not.toMatch(/SET\s+[\s\S]{0,400}?ParentRequirementId\s*=/);
    }
  });
});
