import { describe, expect, it } from "vitest";
import { isAllowedLinkHref, normaliseLinkInput } from "../rich-text/links";

describe("isAllowedLinkHref", () => {
  it.each(["https://example.com", "HTTP://example.com/a?b=c#d", "mailto:pm@example.com"])(
    "allows %s",
    (href) => {
      expect(isAllowedLinkHref(href)).toBe(true);
    },
  );

  it.each([
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "java\tscript:alert(1)",
    " javascript:alert(1)",
    "data:text/html,x",
    "vbscript:x",
    "//evil.example",
    "/relative",
    "#anchor",
    "ftp://example.com",
    "tel:123",
    "http:/one-slash",
    "",
  ])("refuses %j", (href) => {
    expect(isAllowedLinkHref(href)).toBe(false);
  });

  it("ignores control characters and spaces while reading the scheme", () => {
    expect(isAllowedLinkHref(`ht${String.fromCharCode(1)}tps://example.com`)).toBe(true);
    expect(isAllowedLinkHref(`java${String.fromCharCode(10)}script:x`)).toBe(false);
  });
});

describe("normaliseLinkInput", () => {
  it.each([
    ["https://example.com/page", "https://example.com/page"],
    ["  mailto:pm@example.com ", "mailto:pm@example.com"],
    ["example.com/page", "https://example.com/page"],
    ["example.com:8080/x", "https://example.com:8080/x"],
    ["pm@example.com", "mailto:pm@example.com"],
  ])("%j becomes %j", (input, href) => {
    expect(normaliseLinkInput(input)).toBe(href);
  });

  it.each([
    "",
    "   ",
    "javascript:alert(1)",
    "data:text/html,x",
    "tel:123",
    "/relative",
    "just words",
    "nodot",
  ])("refuses %j", (input) => {
    expect(normaliseLinkInput(input)).toBeNull();
  });
});
