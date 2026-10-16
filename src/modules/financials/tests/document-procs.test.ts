import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guardrail for the document checklist procs (ADR-0030). The Access-port procs
 * they replace took @FinancialId from the caller on update and checked nothing,
 * so any document could be moved to, or read from, any financial. Here only the
 * procs that add documents to a financial name it; every other proc finds the
 * financial (and so the project) from the document or attachment row, and no
 * proc takes a project at all. Dynamic SQL is not used.
 */

const folder = join("db", "procs", "financial-document");
const procs = readdirSync(folder)
  .filter((f) => f.startsWith("usp_") && f.endsWith(".sql"))
  .map((f) => ({ name: f.replace(/\.sql$/, ""), source: readFileSync(join(folder, f), "utf8") }));

/** The parameter list between CREATE OR ALTER PROCEDURE and AS. */
function parameters(source: string): string {
  const match = /CREATE OR ALTER PROCEDURE\s+dbo\.\w+([\s\S]*?)\bAS\s+BEGIN/i.exec(source);
  return match?.[1] ?? "";
}

const TAKES_FINANCIAL = new Set([
  "usp_FinancialDocument_Create",
  "usp_FinancialDocument_CreateFromTemplate",
  // The access helper returns it (OUTPUT), it never takes one.
  "usp_FinancialDocument_AssertAccess",
]);

describe("financial document procs take no owner from the caller", () => {
  it("finds the procs", () => {
    expect(procs.length).toBeGreaterThanOrEqual(13);
  });

  it.each(procs.map((p) => [p.name, p] as const))("%s", (name, proc) => {
    const params = parameters(proc.source);
    expect(params, name).not.toMatch(/@ProjectId\b/);
    if (name === "usp_FinancialDocument_AssertAccess") {
      expect(params).toMatch(/@FinancialId\s+INT\s*=\s*NULL\s+OUTPUT/);
    } else if (!TAKES_FINANCIAL.has(name)) {
      expect(params, name).not.toMatch(/@FinancialId\b/);
    }
    expect(proc.source, name).not.toMatch(/sp_executesql|EXEC\s*\(/i);
  });
});
