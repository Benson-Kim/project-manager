import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { messages } from "../messages";
import { sanitizeRichText } from "../rich-text/sanitize";
import { installRichTextSanitizer, isEmptyRichText, richTextSchema } from "../rich-text/schema";

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
