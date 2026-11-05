import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Guardrail: one long unbroken word in a rich-text field wraps inside its box. The client typed one
 * in the executive summary and the box ran out of its column under the project team panel.
 */
const css = readFileSync("src/app/globals.css", "utf8").replace(/\r\n/g, "\n");
const tiptap = readFileSync("node_modules/@tiptap/core/dist/index.js", "utf8");

const rule = (selector: string) => {
  const start = css.indexOf(`\n${selector} {`);
  expect(start, `globals.css: ${selector}`).toBeGreaterThan(-1);
  return css.slice(start, css.indexOf("}", start));
};

describe("a long word in a rich-text field", () => {
  it("breaks anywhere in the stored view and in the editor", () => {
    expect(rule(".rich-text")).toContain("overflow-wrap: anywhere;");
    expect(rule(".rich-text.ProseMirror")).toContain("overflow-wrap: anywhere;");
  });

  it("outweighs the editor's own wrap rule, which is appended after the app's styles", () => {
    expect(tiptap).toMatch(/\.ProseMirror \{[^}]*word-wrap: break-word;/);
    expect(tiptap).toMatch(/getElementsByTagName\("head"\)\[0\]\.appendChild\(styleNode\)/);
  });

  it("does not widen the form it sits in", () => {
    expect(css).toMatch(/@layer base \{\n  fieldset \{\n    min-inline-size: 0;\n  \}\n\}/);
  });
});
