import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { messages } from "../messages";
import { sanitizeRichText } from "../rich-text/sanitize";
import {
  RICH_TEXT_NESTING_MAX,
  RICH_TEXT_RAW_FACTOR,
  installRichTextSanitizer,
  isEmptyRichText,
  nestingExceeds,
  richTextSchema,
} from "../rich-text/schema";

const SANITIZER = Symbol.for("project-manager.rich-text.sanitizer");
const holder = globalThis as { [SANITIZER]?: unknown };

afterEach(() => {
  vi.unstubAllGlobals();
  installRichTextSanitizer(sanitizeRichText);
});

describe("isEmptyRichText", () => {
  it.each([
    "",
    "<p></p>",
    "<p> </p><p><br></p>",
    '<p style="text-align:center"></p>',
    "<p>&nbsp;</p>",
    `<p><span></span>${String.fromCharCode(0xa0)}</p>`,
    "<h2></h2>",
    "<blockquote><p><strong></strong></p></blockquote>",
  ])("%j is empty", (html) => {
    expect(isEmptyRichText(html)).toBe(true);
  });

  it.each([
    "<p>x</p>",
    "<h2>x</h2>",
    "<p>&amp;</p>",
    "<table><tbody><tr><td></td></tr></tbody></table>",
    "<ul><li></li></ul>",
  ])("%j has content", (html) => {
    expect(isEmptyRichText(html)).toBe(false);
  });
});

describe("richTextSchema on the server", () => {
  const optional = richTextSchema({ max: 40 });
  const required = richTextSchema({ max: 40, required: "Enter a description" });

  it("loading sanitize.ts installs the sanitiser", () => {
    expect(holder[SANITIZER]).toBe(sanitizeRichText);
  });

  it("sanitises the value", () => {
    expect(optional.parse("<p>Hi<script>alert(1)</script></p>")).toBe("<p>Hi</p>");
    expect(optional.parse("<div>legacy</div>")).toBe("<p>legacy</p>");
  });

  it.each([undefined, null, "", "<p></p>", "<p><br></p>"])("treats %j as null", (value) => {
    expect(optional.parse(value)).toBeNull();
  });

  it("treats a document that sanitises to nothing as empty", () => {
    expect(optional.parse("<script>alert(1)</script>")).toBeNull();
  });

  it("requires content when asked", () => {
    const result = required.safeParse("<p></p>");
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Enter a description");
    expect(required.parse("<p>ok</p>")).toBe("<p>ok</p>");
  });

  it("measures the maximum on the sanitised HTML", () => {
    // 60 characters in, 8 stored: the script is not counted.
    expect(optional.parse(`<p>ok</p><script>${"x".repeat(40)}</script>`)).toBe("<p>ok</p>");
    const result = optional.safeParse(`<p>${"x".repeat(40)}</p>`);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(messages.richText.tooLong);
  });

  it("refuses raw input over the factor of the maximum before sanitising it", () => {
    const sanitize = vi.fn(sanitizeRichText);
    installRichTextSanitizer(sanitize);
    const result = optional.safeParse(`<p>${"x".repeat(40 * RICH_TEXT_RAW_FACTOR)}</p>`);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(messages.richText.tooLong);
    expect(sanitize).not.toHaveBeenCalled();
  });

  it("refuses markup nested past the limit before sanitising it", () => {
    const schema = richTextSchema({ max: 200_000 });
    const sanitize = vi.fn(sanitizeRichText);
    installRichTextSanitizer(sanitize);
    const deep = (n: number) => "<blockquote>".repeat(n) + "x" + "</blockquote>".repeat(n);
    const result = schema.safeParse(deep(RICH_TEXT_NESTING_MAX + 1));
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(messages.richText.tooDeep);
    expect(sanitize).not.toHaveBeenCalled();
    expect(schema.safeParse(deep(RICH_TEXT_NESTING_MAX)).success).toBe(true);
  });

  it("works inside an object schema as a form field", () => {
    const form = z.object({ description: optional });
    expect(form.parse({ description: "<p><b>x</b></p>" })).toEqual({
      description: "<p><strong>x</strong></p>",
    });
    expect(form.parse({})).toEqual({ description: null });
  });

  it("fails closed when no sanitiser is installed", () => {
    delete holder[SANITIZER];
    expect(() => optional.parse("<p>x</p>")).toThrow(/sanitiser not installed/);
  });
});

describe("richTextSchema in the browser", () => {
  it("validates without sanitising (the server parses again)", () => {
    delete holder[SANITIZER];
    vi.stubGlobal("window", {});
    const schema = richTextSchema({ max: 20, required: "Enter a description" });
    expect(schema.parse("<p>raw <b>x</b></p>")).toBe("<p>raw <b>x</b></p>");
    expect(schema.safeParse("<p></p>").success).toBe(false);
    expect(schema.safeParse(`<p>${"x".repeat(20)}</p>`).success).toBe(false);
  });
});

describe("nestingExceeds", () => {
  it("counts elements opened inside each other, not siblings", () => {
    expect(nestingExceeds("<p>a</p>".repeat(1000), 2)).toBe(false);
    expect(nestingExceeds("<ul><li><ul><li>x</li></ul></li></ul>", 3)).toBe(true);
    expect(nestingExceeds("<ul><li><ul><li>x</li></ul></li></ul>", 4)).toBe(false);
  });

  it("does not count void or self-closed elements, comments or a trailing unclosed tag", () => {
    expect(nestingExceeds("<p>" + "<br>".repeat(500) + "<hr/>" + "<img />" + "</p>", 1)).toBe(
      false,
    );
    expect(nestingExceeds("<!-- <p><p><p> --><p>x</p>", 1)).toBe(false);
    expect(nestingExceeds("<p>x</p><span", 1)).toBe(false);
  });

  it("passes a real editor document: a list ten levels deep inside a table cell", () => {
    let list = "<p>leaf</p>";
    for (let level = 0; level < 10; level++) list = `<ul><li><p>item</p>${list}</li></ul>`;
    const doc = `<table><tbody><tr><td><p><strong><em><s>x</s></em></strong></p>${list}</td></tr></tbody></table>`;
    expect(nestingExceeds(doc, RICH_TEXT_NESTING_MAX)).toBe(false);
  });
});

describe("richTextSchema cost on hostile input up to the 1 MB action body", () => {
  // The schema runs on every rich-text action. Hostile input is refused before the parser sees it,
  // so each case takes milliseconds; the budget only catches a quadratic path, which takes seconds.
  const BUDGET_MS = 1_000;
  const schema = richTextSchema({ max: 200_000 });
  const cases: Record<string, string> = {
    "1 MB of open tags": "<x>".repeat(330_000),
    "open tags under the raw limit": "<x>".repeat(130_000),
    "open lists under the raw limit": "<ul><li>".repeat(48_000),
    "a run of spaces under the raw limit": `<p>a${" ".repeat(390_000)}b</p>`,
    "a full flat document": "<p>Lorem ipsum dolor sit amet.</p>".repeat(5_700),
  };

  for (const [name, html] of Object.entries(cases)) {
    it(`${name} is decided within the budget`, () => {
      const started = performance.now();
      schema.safeParse(html);
      expect(performance.now() - started).toBeLessThan(BUDGET_MS);
    });
  }
});
