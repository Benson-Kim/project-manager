import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { messages } from "@/lib/messages";

/**
 * Guardrail: a decision keeps an impacted area whose option an Admin has since retired. The
 * sheet sends every area back on each save, so without @CurrentLabel a retired one would make the
 * whole decision unsaveable until somebody removed a value they never touched.
 */
function sql(path: string): string {
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}

describe("usp_Decision_ReplaceImpactedAreas", () => {
  const text = sql("db/procs/decision/usp_Decision_ReplaceImpactedAreas.sql");

  it("passes the area the decision already carries as @CurrentLabel", () => {
    expect(text).toMatch(
      /@ListKey = N'decision\.impacted-area', @Label = @Label OUTPUT,\s+@CurrentLabel = @Current;/,
    );
    expect(text).toMatch(
      /SET @Current = \(SELECT TOP \(1\) a\.Label\s+FROM app\.DecisionImpactedArea AS a\s+WHERE a\.DecisionId = @DecisionId AND a\.Label = @Label\);/,
    );
  });
});

describe("usp_Decision_List finds a decision by the reference the app shows", () => {
  const text = sql("db/procs/decision/usp_Decision_List.sql");

  it("searches the reference built the way the proc builds it", () => {
    expect(text).toMatch(
      /OR N'DEC-' \+ CASE WHEN d\.DecisionNumber < 100\s+THEN RIGHT\(N'00' \+ CAST\(d\.DecisionNumber AS NVARCHAR\(10\)\), 3\)\s+ELSE CAST\(d\.DecisionNumber AS NVARCHAR\(10\)\) END\s+LIKE N'%' \+ @Search \+ N'%' ESCAPE N'\\'\)/,
    );
  });

  it.each([1, 9, 42, 99, 100, 999, 1000, 12345])("DEC reference %i matches the proc's", (n) => {
    const proc = `DEC-${n < 100 ? `00${n}`.slice(-3) : String(n)}`;
    expect(messages.decisions.ref(n)).toBe(proc);
  });
});
