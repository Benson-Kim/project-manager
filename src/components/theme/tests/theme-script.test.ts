import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { themeInitScript } from "../theme-provider";
import { ThemeScript } from "../theme-script";

describe("ThemeScript", () => {
  it("renders the pre-paint script with the CSP nonce into the server HTML", () => {
    const html = renderToStaticMarkup(createElement(ThemeScript, { nonce: "abc" }));
    expect(html).toBe(`<script nonce="abc">${themeInitScript}</script>`);
  });

  it("is what the root layout renders, not next/script (React creates, but never runs, a script on the client)", () => {
    const layout = readFileSync("src/app/layout.tsx", "utf8");
    expect(layout).toContain("<ThemeScript nonce={nonce} />");
    expect(layout).not.toContain("next/script");
  });
});
