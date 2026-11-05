import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  STAKEHOLDER_LISTS,
  stakeholderRowSchema,
} from "@/modules/stakeholders/schemas/stakeholder";

/**
 * Guardrail (BL34, migration 054): the stakeholder communication plan — Communication purpose,
 * Key message strategy and Frequency.
 *
 * The row schema mirrors the SELECT shape of usp_Stakeholder_{Create,GetById,List,Update}
 * exactly, so a column added to three procs and forgotten in the fourth fails the zod parse of
 * that one path at runtime and nowhere else. Held here as SQL text, because nothing in
 * TypeScript can see a proc.
 */
/** LF whatever the checkout: Windows with core.autocrlf writes the procs with CRLF. */
function sql(path: string): string {
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}

const DIR = "db/procs/stakeholder";
const MIGRATION = "db/migrations/054_stakeholder_communication_plan.sql";
const SET_PROC = "db/procs/lookup-list/usp_LookupList_Set.sql";
const PROCS = ["Create", "GetById", "List", "Update"] as const;
const WRITES = ["Create", "Update"] as const;
/** The three columns the client asked for, and the two lists that back the dropdowns. */
const PLAN = ["CommunicationPurpose", "KeyMessageStrategy", "CommunicationFrequency"] as const;
const LISTS = {
  CommunicationPurpose: "stakeholder.communication-purpose",
  CommunicationFrequency: "stakeholder.communication-frequency",
} as const;

const proc = (name: string) => sql(join(DIR, `usp_Stakeholder_${name}.sql`));

/**
 * The columns one proc returns, read from the row SELECT — the one that starts at the statement
 * indent, not the single-line SELECTs inside the audit JSON.
 */
function returnedColumns(text: string): string[] {
  const start = text.indexOf("    SELECT StakeholderId,");
  expect(start).toBeGreaterThan(-1);
  const end = text.indexOf("\n    FROM app.Stakeholder", start);
  expect(end).toBeGreaterThan(start);
  return text
    .slice(start, end)
    .replace("    SELECT ", "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => /AS (\w+)$/.exec(part)?.[1] ?? part.replace(/[[\]]/g, ""));
}

describe("the stakeholder communication plan is stored and read whole (BL34)", () => {
  it("migration 054 adds the three columns, each guarded so a re-run is safe", () => {
    const text = sql(MIGRATION);
    expect(text).toMatch(/\[CommunicationPurpose\] NVARCHAR\(50\) NULL/);
    expect(text).toMatch(/\[KeyMessageStrategy\] NVARCHAR\(MAX\) NULL/);
    expect(text).toMatch(/\[CommunicationFrequency\] NVARCHAR\(50\) NULL/);
    for (const column of PLAN) {
      expect(text, column).toContain(`IF COL_LENGTH(N'app.Stakeholder', N'${column}') IS NULL`);
    }
  });

  it("the dropdowns are managed lists, never a CHECK constraint (ADR-0022, BL20)", () => {
    // Migration 018 removed this table's CHECK constraints so an Admin could edit the vocabulary;
    // a new one would take that back for these two columns.
    const text = sql(MIGRATION);
    expect(text).not.toMatch(/CHECK\s*\(/);
    for (const key of Object.values(LISTS)) {
      expect(text, key).toContain(`(N'${key}')`);
      expect(STAKEHOLDER_LISTS).toContain(key);
    }
  });

  it("seeds the client's own examples, and locks none of them", () => {
    const text = sql(MIGRATION);
    const seeds = [
      "Gather Requirements",
      "Provide Status",
      "Secure Approvals",
      "Daily",
      "Weekly",
      "Monthly",
      "Milestone-Driven",
      "Ad-Hoc",
    ];
    for (const label of seeds) {
      expect(text, label).toContain(`N'${label}'`);
    }
    // No code reads any of these labels by name, so every one stays the client's to rename or
    // remove. A locked seed here would also have to be added to src/tests/lookup-lists.test.ts.
    const tuples = [...text.matchAll(/\(N'stakeholder\.[a-z-]+',\s*N'[^']+',\s*\d+,\s*([01])\)/g)];
    expect(tuples).toHaveLength(seeds.length);
    expect(tuples.every((match) => match[1] === "0")).toBe(true);
  });

  it.each(PROCS)("usp_Stakeholder_%s returns the plan with the rest of the row", (name) => {
    const columns = returnedColumns(proc(name));
    for (const column of PLAN) {
      expect(columns, column).toContain(column);
    }
  });

  it.each(["Create", "GetById", "Update"] as const)(
    "usp_Stakeholder_%s returns exactly what the row schema parses",
    (name) => {
      // The list proc adds TotalCount and the actor-access columns, so only these three are the
      // row shape itself.
      expect(returnedColumns(proc(name)).sort()).toEqual(
        Object.keys(stakeholderRowSchema.shape).sort(),
      );
    },
  );

  it.each(WRITES)("usp_Stakeholder_%s takes the plan, the lists sized as their columns", (name) => {
    const text = proc(name);
    expect(text).toMatch(/@CommunicationPurpose NVARCHAR\(50\) = NULL/);
    expect(text).toMatch(/@KeyMessageStrategy NVARCHAR\(MAX\) = NULL/);
    expect(text).toMatch(/@CommunicationFrequency NVARCHAR\(50\) = NULL/);
  });

  it.each(WRITES)("usp_Stakeholder_%s checks both values against their live list", (name) => {
    const text = proc(name);
    for (const [column, key] of Object.entries(LISTS)) {
      expect(text, key).toContain(`@ListKey = N'${key}', @Label = @${column} OUTPUT`);
    }
  });

  it("usp_Stakeholder_Update keeps a retired value on a record nobody is changing", () => {
    // Without @CurrentLabel, an Admin removing an option would make every record still holding it
    // unsaveable — a field the user never touched refusing the whole form.
    const text = proc("Update");
    expect(text).toContain("@CurrentLabel = @CurrentPurpose");
    expect(text).toContain("@CurrentLabel = @CurrentFrequency");
    expect(text).toMatch(/@CurrentPurpose = CommunicationPurpose/);
    expect(text).toMatch(/@CurrentFrequency = CommunicationFrequency/);
  });

  it.each(WRITES)("usp_Stakeholder_%s audits the plan with the rest of the row", (name) => {
    // The audit snapshot is the only record of what a field held before; a column missing from it
    // is a change nobody can reconstruct.
    const text = proc(name);
    const snapshots = text.match(/\(SELECT StakeholderId,[^\n]+/g) ?? [];
    expect(snapshots.length).toBeGreaterThan(0);
    for (const json of snapshots) {
      for (const column of PLAN) {
        expect(json, `${name} ${column}`).toContain(`[${column}]`);
      }
    }
  });

  it("a renamed option follows the records that store it", () => {
    const text = sql(SET_PROC);
    for (const [column, key] of Object.entries(LISTS)) {
      const branch = text.indexOf(`ELSE IF @ListKey = N'${key}'`);
      expect(branch, key).toBeGreaterThan(-1);
      expect(text.slice(branch, branch + 400)).toContain(`[${column}] = r.NewLabel`);
    }
  });
});
