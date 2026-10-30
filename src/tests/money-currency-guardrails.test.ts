import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guardrail: formatMoney's currency is an optional second argument (ADR-0051), so a call site that
 * forgets it still compiles and silently renders the figure with no symbol — invisible in review
 * and invisible on the page. Every call inside the financials module must therefore be explicit:
 * the sheet's currency where the figure is read, NO_CURRENCY where it is typed back (an input's
 * value and its placeholder must stay parseable by parseMoney).
 */
const ROOTS = ["src/modules/financials", "src/app/(app)/projects/[id]/financials"];

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

/** Every `formatMoney(` call's argument text, by matching brackets rather than a regex. */
function calls(text: string): string[] {
  const found: string[] = [];
  for (
    let at = text.indexOf("formatMoney(");
    at !== -1;
    at = text.indexOf("formatMoney(", at + 1)
  ) {
    if (/[A-Za-z0-9_$]/.test(text[at - 1] ?? "")) continue; // formatMoneyField
    let depth = 0;
    let i = at + "formatMoney".length;
    for (; i < text.length; i++) {
      if ("([{".includes(text[i]!)) depth++;
      else if (")]}".includes(text[i]!) && --depth === 0) break;
    }
    found.push(text.slice(at + "formatMoney(".length, i));
  }
  return found;
}

/** Its arguments, split on the commas that are not inside a nested call. */
function args(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if ("([{".includes(text[i]!)) depth++;
    else if (")]}".includes(text[i]!)) depth--;
    else if (text[i] === "," && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((part) => part.trim()).filter((part) => part !== "");
}

describe("every financials call names the currency it formats money in", () => {
  const files = ROOTS.flatMap(sources).filter((path) => !path.includes("/tests/"));

  it("finds the call sites it is meant to guard", () => {
    expect(files.length).toBeGreaterThan(5);
    expect(files.flatMap((path) => calls(readFileSync(path, "utf8"))).length).toBeGreaterThan(15);
  });

  it.each(files)("%s", (path) => {
    for (const call of calls(readFileSync(path, "utf8"))) {
      expect(args(call).length, `formatMoney(${call}) omits its currency`).toBe(2);
    }
  });
});
