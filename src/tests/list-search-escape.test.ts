import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guardrail: a proc that searches with LIKE must neutralise the pattern metacharacters first.
 * `%`, `_` and `[` are wildcards in T-SQL, so a search for "50%" or "a[1]" would otherwise match
 * the wrong rows, and the escape character itself has to go first. Every proc that builds a LIKE
 * from @Search or @Prefix runs the same four-REPLACE chain and ends the predicate with ESCAPE.
 */
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walk(p);
    return name.endsWith(".sql") ? [p] : [];
  });
}

const chainFor = (param: string) =>
  `REPLACE(REPLACE(REPLACE(REPLACE(@${param}, N'\\', N'\\\\'), N'%', N'\\%'), N'_', N'\\_'), N'[', N'\\[')`;

/** Every LIKE line that puts a search parameter into the pattern, per proc. */
function searchPredicates(sql: string, param: string): string[] {
  const like = new RegExp(String.raw`^.*\bLIKE\b[^\n]*@${param}\b[^\n]*$`, "gm");
  return (sql.match(like) ?? []).filter((line) => !line.trim().startsWith("--"));
}

describe("list search escapes the LIKE metacharacters (ADR-0016)", () => {
  const procs = walk("db/procs").map((path) => ({ path, sql: readFileSync(path, "utf8") }));
  const searchers = procs.flatMap(({ path, sql }) =>
    ["Search", "Prefix"]
      .map((param) => ({ path, sql, param, predicates: searchPredicates(sql, param) }))
      .filter(({ predicates }) => predicates.length > 0),
  );

  it("finds the searching procs", () => {
    // 24 today. A proc that legitimately stops searching lowers this in the same commit, with the
    // reason; deleting the assertion instead would let a regex that matches nothing pass.
    expect(searchers.length).toBeGreaterThanOrEqual(24);
  });

  it.each(searchers.map((s) => [`${s.path} (@${s.param})`, s] as const))(
    "%s escapes the pattern before it reaches the predicate",
    (_name, { sql, param }) => {
      expect(sql).toContain(chainFor(param));
    },
  );

  it.each(searchers.map((s) => [`${s.path} (@${s.param})`, s] as const))(
    "%s ends every LIKE on the parameter with ESCAPE",
    (_name, { predicates }) => {
      for (const predicate of predicates) expect(predicate).toContain("ESCAPE N'\\'");
    },
  );
});
