import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guardrail: every print action carries the one printer icon. Printing starts only in the shared
 * PrintButton, and a link to a printable view (a route ending in /print) is the shared PrintLink,
 * so a new print action cannot ship as a bare text button or link.
 */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "tests" ? [] : sourceFiles(path);
    return /\.tsx?$/.test(name) ? [path.replaceAll("\\", "/")] : [];
  });
}

const files = sourceFiles("src").map((path) => ({ path, text: readFileSync(path, "utf8") }));

describe("print actions share the printer icon", () => {
  it("both shared print controls render the printer icon", () => {
    for (const path of ["src/components/ui/print-button.tsx", "src/components/ui/print-link.tsx"]) {
      expect(readFileSync(path, "utf8"), path).toContain("<PrinterIcon");
    }
  });

  it("only the shared PrintButton calls printWithPreview", () => {
    const callers = files
      .filter(({ text }) => /printWithPreview\(/.test(text))
      .map(({ path }) => path)
      .filter((path) => path !== "src/lib/print-with-preview.ts");
    expect(callers).toEqual(["src/components/ui/print-button.tsx"]);
  });

  it("links to a printable view go through PrintLink", () => {
    const bare = files
      .filter(({ path }) => path !== "src/components/ui/print-link.tsx")
      .filter(({ text }) => /<(?:Link|a)\b[^>]*\/print[`"]/.test(text))
      .map(({ path }) => path);
    expect(bare).toEqual([]);
  });
});
