import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guardrail: the app is stored-procedure-only. This test fails the build if
 * anyone introduces inline SQL in src/ (raw query() calls or SQL verbs inside
 * string/template literals). The db layer itself is the single allowed caller
 * of `request.execute` — and even it must never call `.query(`.
 */
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walk(p);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
  });
}

const INLINE_SQL =
  /\b(SELECT\s+.+\s+FROM|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|CREATE\s+TABLE|ALTER\s+TABLE|EXEC(UTE)?\s*\()/i;

describe("stored-procedure-only guarantee", () => {
  const files = walk("src");

  it("finds source files to scan", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("%s contains no .query( call", (file) => {
    const source = readFileSync(file, "utf8");
    expect(source, `${file} must not use raw .query() — stored procedures only`).not.toMatch(
      /\.\s*query\s*(<[^>]*>)?\s*\(/,
    );
  });

  it.each(files)("%s contains no inline SQL statements", (file) => {
    const source = readFileSync(file, "utf8");
    for (const m of source.matchAll(/(["'`])(?:\\.|(?!\1)[\s\S])*\1/g)) {
      expect(m[0], `${file} embeds inline SQL — use a stored procedure`).not.toMatch(INLINE_SQL);
    }
  });
});
