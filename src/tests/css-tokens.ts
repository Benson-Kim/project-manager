import { readFileSync } from "node:fs";

/** The app's stylesheet, read once for the CSS guardrails. */
export const css = readFileSync("src/app/globals.css", "utf8");

/** The #rrggbb value of a token in a scope (":root", '[data-theme="dark"]'), or undefined. */
export function tokenValue(scope: string, token: string): string | undefined {
  const start = css.indexOf(`${scope} {`);
  if (start < 0) return undefined;
  const body = css.slice(start, css.indexOf("}", start));
  return new RegExp(`${token}:\\s*(#[0-9a-f]{6});`, "i").exec(body)?.[1];
}

/** WCAG 2.2 contrast ratio of two #rrggbb colours. */
export function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
