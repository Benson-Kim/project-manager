import { describe, expect, it } from "vitest";
import { contrast, tokenValue } from "./css-tokens";

/**
 * Guardrail: the theme's text and fill pairs keep WCAG AA in the light and the dark theme, so a
 * colour change cannot fail the axe scans. Text needs 4.5:1, the focus ring 3:1 against what it
 * sits on. Hover fills are checked with the text that stays on them.
 */
const SCOPES = [":root", '[data-theme="dark"]'];
const BACKGROUNDS = ["--canvas", "--surface", "--surface-raised", "--hover"];

const TEXT_PAIRS: [string, string][] = [
  ...BACKGROUNDS.flatMap((bg): [string, string][] => [
    ["--ink", bg],
    ["--ink-muted", bg],
    ["--accent", bg],
    ["--danger", bg],
  ]),
  ["--accent-strong", "--surface"],
  ["--accent", "--accent-soft"],
  ["--accent-strong", "--accent-soft"],
  ["--ink", "--accent-soft"],
  ["--on-accent", "--accent"],
  ["--on-accent", "--accent-strong"],
  ["--on-primary", "--primary"],
  ["--on-primary", "--primary-hover"],
  ["--on-primary", "--primary-active"],
  ["--on-danger", "--danger"],
  ["--on-danger", "--danger-hover"],
  ["--danger", "--danger-soft"],
  ["--success", "--canvas"],
  ["--warning", "--canvas"],
];

function pair(scope: string, foreground: string, background: string): number {
  const fg = tokenValue(scope, foreground);
  const bg = tokenValue(scope, background);
  expect(fg, `${foreground} in ${scope}`).toBeTruthy();
  expect(bg, `${background} in ${scope}`).toBeTruthy();
  return contrast(fg as string, bg as string);
}

describe("theme colours keep AA contrast", () => {
  for (const scope of SCOPES) {
    it.each(TEXT_PAIRS)(`%s on %s in ${scope}`, (foreground, background) => {
      expect(pair(scope, foreground, background)).toBeGreaterThanOrEqual(4.5);
    });

    it.each(["--canvas", "--surface"])(`--focus against %s in ${scope}`, (background) => {
      expect(pair(scope, "--focus", background)).toBeGreaterThanOrEqual(3);
    });

    it(`hover stands out from surface and raised in ${scope}`, () => {
      expect(pair(scope, "--hover", "--surface")).toBeGreaterThanOrEqual(1.1);
      expect(pair(scope, "--hover", "--surface-raised")).toBeGreaterThanOrEqual(1.05);
    });

    it(`sections stand out from the canvas in ${scope}`, () => {
      expect(pair(scope, "--surface", "--canvas")).toBeGreaterThan(1.03);
    });
  }
});
