import { describe, expect, it } from "vitest";
import { contrast, tokenValue } from "./css-tokens";

/**
 * Guardrail: a plan box is filled with its level's colour, and everything written on it (name,
 * code, dates, meta, the add button) uses the ink, muted ink or level ink tokens. Each pair must
 * keep WCAG AA (4.5:1) in the light and the dark theme, so a new fill cannot fail the axe scans.
 * The same holds for text on coral (the Gantt's Today tag).
 */
const SCOPES = [":root", '[data-theme="dark"]'];
const FILLS = ["--level-1", "--level-2", "--level-3"];
const INKS = ["--ink", "--ink-muted", "--level-ink"];

describe("plan level fills keep text readable", () => {
  for (const scope of SCOPES) {
    for (const fill of FILLS) {
      it.each(INKS)(`%s on ${fill} in ${scope}`, (ink) => {
        const background = tokenValue(scope, fill);
        const foreground = tokenValue(scope, ink);
        expect(background, `${fill} in ${scope}`).toBeTruthy();
        expect(foreground, `${ink} in ${scope}`).toBeTruthy();
        expect(contrast(foreground as string, background as string)).toBeGreaterThanOrEqual(4.5);
      });
    }
    it(`--on-coral on --coral in ${scope}`, () => {
      const background = tokenValue(scope, "--coral");
      const foreground = tokenValue(scope, "--on-coral");
      expect(foreground, `--on-coral in ${scope}`).toBeTruthy();
      expect(contrast(foreground as string, background as string)).toBeGreaterThanOrEqual(4.5);
    });
  }
});
