import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guardrail (STANDARDS §2): src/lib/db.ts is the ONLY module that may import
 * mssql. Everything else goes through execProc. (ESLint enforces this too;
 * this test is the lint-config-tamper backstop.)
 */
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walk(p);
    return /\.(ts|tsx)$/.test(name) ? [p] : [];
  });
}

const ALLOWED = new Set([join("src", "lib", "db.ts")]);

describe("single database gateway", () => {
  const files = walk("src").filter((f) => !ALLOWED.has(f));

  it("scans source files", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("%s does not import mssql", (file) => {
    const source = readFileSync(file, "utf8");
    expect(source, `${file} must not import mssql — use execProc from src/lib/db.ts`).not.toMatch(
      /from\s+["']mssql["']|require\(\s*["']mssql["']\s*\)/,
    );
  });
});
