import { describe, expect, it } from "vitest";
import { asRichText, richTextToPlain } from "@/lib/rich-text/plain-text";

/**
 * richTextToPlain feeds the places that take a string rather than a node — a
 * DataView row label, a sheet title, a delete confirmation. It unescapes, so
 * its result is text and must never be rendered as HTML.
 */
describe("richTextToPlain", () => {
  it("is empty for an absent or empty value", () => {
    expect(richTextToPlain(null)).toBe("");
    expect(richTextToPlain(undefined)).toBe("");
    expect(richTextToPlain("")).toBe("");
    expect(richTextToPlain("<p></p>")).toBe("");
  });

  it("drops the tags and keeps the words", () => {
    expect(richTextToPlain("<div>Adding risks raises an error</div>")).toBe(
      "Adding risks raises an error",
    );
  });

  it("keeps two blocks apart rather than running them together", () => {
    expect(richTextToPlain("<p>First</p><p>Second</p>")).toBe("First Second");
    expect(richTextToPlain("<li>One</li><li>Two</li>")).toBe("One Two");
    expect(richTextToPlain("Line<br>Next")).toBe("Line Next");
  });

  it("decodes the entities the sanitiser writes", () => {
    expect(richTextToPlain("<p>Clicking &quot;New Item&quot; &amp; waiting</p>")).toBe(
      'Clicking "New Item" & waiting',
    );
    expect(richTextToPlain("<p>a &lt; b &gt; c</p>")).toBe("a < b > c");
    expect(richTextToPlain("<p>it&#39;s here</p>")).toBe("it's here");
    expect(richTextToPlain("<p>a&nbsp;b</p>")).toBe("a b");
  });

  it("collapses the whitespace the markup leaves behind", () => {
    expect(richTextToPlain("<p>  spaced   out  </p>")).toBe("spaced out");
  });

  it("reads back what asRichText wrote", () => {
    expect(richTextToPlain(asRichText("One\nTwo"))).toBe("One Two");
    expect(richTextToPlain(asRichText("a < b"))).toBe("a < b");
  });
});
