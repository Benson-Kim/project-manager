import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guardrail: a sheet opened on `?id=new` is editable for someone who may create the record, even
 * when they may not edit existing ones. Every sheet disables its form on `!canEdit`, so a page that
 * passes the update permission locks the new form for a create-only person.
 */
function pages(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return pages(path);
    return entry.name === "page.tsx" ? [path] : [];
  });
}

const sheets = pages("src/app/(app)").flatMap((path) => {
  const text = readFileSync(path, "utf8").replace(/\r\n/g, "\n");
  return [...text.matchAll(/<(\w+Sheet)\b([^>]*?)\/>/gs)]
    .filter((m) => /\bisNew=\{/.test(m[2]!))
    .map((m) => ({ path, sheet: m[1]!, props: m[2]! }));
});

describe("a new-item sheet takes the create permission", () => {
  it("finds the sheets it checks", () => {
    expect(sheets.length).toBeGreaterThanOrEqual(14);
  });

  for (const { path, sheet, props } of sheets) {
    it(`${path} ${sheet}`, () => {
      expect(props).toContain("canEdit={isNew ? canCreate : canEdit}");
    });
  }
});
