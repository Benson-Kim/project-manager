import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guardrail: every date on screen reads YYYY-MM-DD (the client's agreed
 * format), through formatDate in src/lib/format.ts. A locale date formatter
 * anywhere else brings back "Mar 15, 2026" on one screen. Month names used as
 * labels (the Gantt's month header, financial month columns) carry no day, so
 * they stay allowed.
 */
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walk(p);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
  });
}

const LOCALE_DATE =
  /\btoLocale(Date|Time)String\s*\(|\b(dateStyle|timeStyle)\s*:|\bday\s*:\s*["'](numeric|2-digit)["']/;

describe("one date format", () => {
  const files = [...walk("src"), ...walk("electron")];

  it("finds source files to scan", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("formats dates only through formatDate", () => {
    const offenders = files.filter((file) => LOCALE_DATE.test(readFileSync(file, "utf8")));
    expect(offenders, "show dates with formatDate (src/lib/format.ts), not a locale").toEqual([]);
  });
});
