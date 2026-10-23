import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { messages } from "@/lib/messages";
import {
  CELL_SHADES,
  HIGHLIGHT_COLORS,
  HEADING_LEVELS,
  INDENT_MAX,
  INDENT_STEP_EM,
  NUMBERING_STYLES,
  TEXT_COLORS,
} from "@/lib/rich-text/formats";

/**
 * Guardrail (ADR-0041): every name in the formatting vocabulary has its stylesheet rule, its
 * toolbar swatch, a light and a dark token, a print reset and a label. Adding a colour to
 * formats.ts without the CSS would store a name nothing paints.
 */
const css = readFileSync("src/app/globals.css", "utf8");

function block(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start, `no rule for ${selector}`).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf("}", start));
}

const tokenIn = (scope: string, token: string) => {
  const start = css.indexOf(`${scope} {`);
  return css.slice(start, css.indexOf("}", start)).includes(`${token}:`);
};

function tokenValue(scope: string, token: string): string {
  const start = css.indexOf(`${scope} {`);
  const body = css.slice(start, css.indexOf("}", start));
  const value = new RegExp(`${token}:\\s*(#[0-9a-f]{6});`, "i").exec(body)?.[1];
  expect(value, `${token} in ${scope}`).toBeTruthy();
  return value as string;
}

/** WCAG 2.2 contrast ratio of two #rrggbb colours. */
function contrast(a: string, b: string): number {
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

describe("rich-text formats have their styles", () => {
  it.each(TEXT_COLORS)("text colour %s", (color) => {
    expect(block(`.rich-text span[data-color="${color}"]`)).toContain(`var(--tone-${color}-ink)`);
    expect(block(`.rt-swatch[data-swatch="text"][data-color="${color}"]`)).toContain(
      `var(--tone-${color}-ink)`,
    );
    expect(messages.richText.colors[color]).toBeTruthy();
  });

  it.each(HIGHLIGHT_COLORS)("highlight %s", (color) => {
    const rule =
      color === "yellow"
        ? block(".rich-text mark")
        : block(`.rich-text mark[data-color="${color}"]`);
    expect(rule).toContain(`var(--hl-${color})`);
    expect(block(`.rt-swatch[data-swatch="highlight"][data-color="${color}"]`)).toContain(
      `var(--hl-${color})`,
    );
    expect(tokenIn(":root", `--hl-${color}`)).toBe(true);
    expect(tokenIn('[data-theme="dark"]', `--hl-${color}`)).toBe(true);
    expect(messages.richText.colors[color]).toBeTruthy();
  });

  it.each(CELL_SHADES)("cell shade %s", (shade) => {
    expect(block(`.rich-text [data-shade="${shade}"]`)).toContain(`var(--tone-${shade}-soft)`);
    expect(block(`.rt-swatch[data-swatch="shade"][data-color="${shade}"]`)).toContain(
      `var(--tone-${shade}-soft)`,
    );
    expect(messages.richText.colors[shade]).toBeTruthy();
  });

  it("every indent level", () => {
    for (let level = 1; level <= INDENT_MAX; level += 1) {
      expect(block(`.rich-text [data-indent="${level}"]`)).toContain(
        `margin-left: ${level * INDENT_STEP_EM}em`,
      );
    }
  });

  it("every heading level and numbering style has a label", () => {
    for (const level of HEADING_LEVELS) {
      expect(messages.richText[`heading${level}`]).toBeTruthy();
      expect(css).toContain(`.rich-text h${level} {`);
    }
    for (const style of NUMBERING_STYLES) {
      expect(messages.richText.numberingStyles[style.type]).toBeTruthy();
    }
  });

  it("a highlight sets its own ink, and a text colour inside it takes that ink", () => {
    expect(block(".rich-text mark")).toContain("color: var(--ink)");
    expect(block(".rich-text mark span[data-color]")).toContain("color: inherit");
  });

  it.each([":root", '[data-theme="dark"]'])(
    "in %s, text and links on every highlight reach 4.5:1",
    (scope) => {
      for (const color of HIGHLIGHT_COLORS) {
        const background = tokenValue(scope, `--hl-${color}`);
        for (const ink of ["--ink", "--accent-strong"]) {
          expect(
            contrast(tokenValue(scope, ink), background),
            `${ink} on ${color}`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
    },
  );

  it("printing resets every tone and highlight to its light value", () => {
    const print = css.slice(css.indexOf("Coloured rich text (ADR-0041) prints"));
    const reset = print.slice(0, print.indexOf("color-scheme: light;"));
    for (const name of new Set([...TEXT_COLORS, ...CELL_SHADES])) {
      expect(reset).toContain(`--tone-${name}-ink:`);
      expect(reset).toContain(`--tone-${name}-soft:`);
    }
    for (const color of HIGHLIGHT_COLORS) expect(reset).toContain(`--hl-${color}:`);
  });
});
