import { describe, expect, it } from "vitest";
import { contrast, tokenValue } from "./css-tokens";

/**
 * Guardrail: a plan box is filled with its status's colour (a Gantt card with its level's), and
 * everything written on it (name,
 * code, dates, meta, the add button) uses the ink, muted ink or level ink tokens. Each pair must
 * keep WCAG AA (4.5:1) in the light and the dark theme, so a new fill cannot fail the axe scans.
 * The same holds for text on coral (the Gantt's Today tag).
 */
const SCOPES = [":root", '[data-theme="dark"]'];
const FILLS = ["--level-1", "--level-2", "--level-3"];
const INKS = ["--ink", "--ink-muted", "--level-ink"];
const OPTION_COLORS = ["red", "orange", "yellow", "green", "blue", "purple", "gray"];

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
    // A WBS box is filled with its status's colour at the top level, so every soft tone carries
    // the same text as a level fill does.
    for (const tone of OPTION_COLORS) {
      it.each(["--ink", "--ink-muted"])(`%s on --tone-${tone}-soft in ${scope}`, (ink) => {
        const background = tokenValue(scope, `--tone-${tone}-soft`);
        const foreground = tokenValue(scope, ink);
        expect(background, `--tone-${tone}-soft in ${scope}`).toBeTruthy();
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
