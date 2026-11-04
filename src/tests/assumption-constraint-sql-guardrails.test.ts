import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ASSUMPTION_CONSTRAINT_LISTS } from "@/modules/assumptions-constraints/schemas/assumption-constraint";

/**
 * Guardrail (ADR-0054, client backlog BL20): the register's Validated column is a managed list
 * (migration 053) and app.AssumptionConstraint.IsValidated is kept only as a derived copy, so a
 * release rolled back to the previous code still reads a correct column.
 *
 * Two ways that goes wrong read as working code: a write proc that stores Validated and forgets
 * the BIT leaves the two disagreeing from then on, and a proc that takes @IsValidated again puts
 * the decision back in the caller's hands, where the list can no longer constrain it. Neither can
 * be seen from TypeScript, so what is held here is the SQL text.
 */
/** LF whatever the checkout: Windows with core.autocrlf writes the procs with CRLF. */
function sql(path: string): string {
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}

const DIR = "db/procs/assumption-constraint";
const MIGRATION = "db/migrations/053_assumption_constraint_validated.sql";
const WRITES = ["Create", "Update"] as const;
const READS = ["GetById", "List"] as const;

/** The one expression that turns the list's locked Yes into the derived BIT. */
const DERIVED = "CASE WHEN @Validated = N'Yes' THEN 1 ELSE 0 END";

describe("Validated is the register's value and IsValidated follows it (ADR-0054)", () => {
  it.each(WRITES)("usp_AssumptionConstraint_%s takes the label, not the flag", (name) => {
    const text = sql(join(DIR, `usp_AssumptionConstraint_${name}.sql`));
    expect(text).toMatch(/@Validated\s+NVARCHAR\(50\)/);
    // A caller that can still send the BIT could set it against the list's answer.
    expect(text).not.toMatch(/@IsValidated\s+BIT/);
  });

  it.each(WRITES)("usp_AssumptionConstraint_%s writes both, the flag derived", (name) => {
    const text = sql(join(DIR, `usp_AssumptionConstraint_${name}.sql`));
    expect(text).toContain("[Validated]");
    expect(text).toContain("[IsValidated]");
    expect(text).toContain(DERIVED);
  });

  it.each(WRITES)("usp_AssumptionConstraint_%s checks the label against the live list", (name) => {
    const text = sql(join(DIR, `usp_AssumptionConstraint_${name}.sql`));
    expect(text).toContain(
      "@ListKey = N'assumption-constraint.validated', @Label = @Validated OUTPUT",
    );
  });

  it.each(READS)("usp_AssumptionConstraint_%s returns the label and not the flag", (name) => {
    // The row schema reads Validated; a proc still sending IsValidated would make the zod parse
    // of a column nothing renders the only thing keeping the two in the contract.
    const text = sql(join(DIR, `usp_AssumptionConstraint_${name}.sql`));
    expect(text).toContain("[Validated]");
    expect(text).not.toMatch(/^\s+(?:ac\.)?\[IsValidated\],$/m);
  });

  it("every list the module reads is checked by a proc", () => {
    const text = WRITES.map((name) => sql(join(DIR, `usp_AssumptionConstraint_${name}.sql`))).join(
      "\n",
    );
    for (const key of ASSUMPTION_CONSTRAINT_LISTS) {
      expect(text, key).toContain(`@ListKey = N'${key}'`);
    }
  });

  it("the migration adds the column and backfills it from the flag without dropping it", () => {
    const text = sql(MIGRATION);
    expect(text).toContain("ADD [Validated] NVARCHAR(50) NULL");
    expect(text).toContain("CASE WHEN [IsValidated] = 1 THEN N'Yes' ELSE N'No' END");
    // Dropping the BIT would make the release one-way; it is left for a later one.
    expect(text).not.toMatch(/DROP COLUMN/i);
    // A re-run must not overwrite a value an Admin has since changed.
    expect(text).toContain("WHERE [Validated] IS NULL");
  });
});
