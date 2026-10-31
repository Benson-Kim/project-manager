import { describe, expect, it } from "vitest";
import { AVATAR_SL, avatarFill, avatarHue, stackOf } from "../avatar-stack";
import { panelPosition } from "../data-view/datasheet";
import { clampPercent } from "../progress-bar";
import { LEVEL_TONES, planTone, TONES } from "../tones";

describe("planTone", () => {
  it("colours levels 1 and 2 on their own and every deeper level like level 3", () => {
    expect(planTone(1)).toBe(LEVEL_TONES[0]);
    expect(planTone(2)).toBe(LEVEL_TONES[1]);
    expect(planTone(3)).toBe(LEVEL_TONES[2]);
    expect(planTone(10)).toBe(LEVEL_TONES[2]);
  });

  it("treats the root and nonsense levels as level 1", () => {
    expect(planTone(0)).toBe(LEVEL_TONES[0]);
    expect(planTone(-3)).toBe(LEVEL_TONES[0]);
    expect(planTone(1.7)).toBe(LEVEL_TONES[0]);
  });

  it("lets the item's own colour win over its level", () => {
    expect(planTone(2, "green")).toBe(TONES.green.badge);
    expect(planTone(2, null)).toBe(LEVEL_TONES[1]);
  });
});

describe("clampPercent", () => {
  it("rounds to a whole percentage inside 0..100", () => {
    expect(clampPercent(33.4)).toBe(33);
    expect(clampPercent(66.5)).toBe(67);
    expect(clampPercent(-5)).toBe(0);
    expect(clampPercent(140)).toBe(100);
  });

  it("reads anything that is not a finite number as 0", () => {
    expect(clampPercent(Number.NaN)).toBe(0);
    expect(clampPercent(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("stackOf", () => {
  it("shows everyone when they fit", () => {
    expect(stackOf(["Ann Lee", "Bo Ng"], 3)).toEqual({
      all: ["Ann Lee", "Bo Ng"],
      shown: ["Ann Lee", "Bo Ng"],
      more: 0,
    });
  });

  it("keeps the last slot for +N when there are too many", () => {
    const stack = stackOf(["A", "B", "C", "D", "E"], 3);
    expect(stack.shown).toEqual(["A", "B"]);
    expect(stack.more).toBe(3);
  });

  it("counts each person once and skips blank names", () => {
    expect(stackOf(["Ann", " Ann ", "", "  "], 3)).toEqual({
      all: ["Ann"],
      shown: ["Ann"],
      more: 0,
    });
  });

  it("still reports the people when only the +N chip fits", () => {
    const stack = stackOf(["A", "B"], 1);
    expect(stack.all).toEqual(["A", "B"]);
    expect(stack.shown).toEqual([]);
    expect(stack.more).toBe(2);
  });
});

describe("panelPosition sizes", () => {
  const viewport = { width: 1280, height: 800 };

  it("keeps the rich-text defaults when no sizes are given", () => {
    expect(panelPosition({ left: 100, top: 200, bottom: 248, width: 40 }, viewport).width).toBe(
      560,
    );
  });

  it("takes a smaller minimum width and room below for a note", () => {
    const sizes = { minWidth: 320, minBelow: 220 };
    expect(panelPosition({ left: 100, top: 200, bottom: 232, width: 32 }, viewport, sizes)).toEqual(
      {
        left: 100,
        width: 320,
        top: 236,
        maxHeight: 548,
      },
    );
    expect(panelPosition({ left: 100, top: 600, bottom: 632, width: 32 }, viewport, sizes)).toEqual(
      {
        left: 100,
        width: 320,
        bottom: 204,
        maxHeight: 580,
      },
    );
  });
});

/** WCAG contrast of white text on hsl(h s% l%). */
function whiteContrast(hue: number, saturation: number, lightness: number): number {
  const s = saturation / 100;
  const l = lightness / 100;
  const k = (n: number) => (n + hue / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const channel = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  const linear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = [0, 8, 4].map((n) => linear(channel(n)));
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return 1.05 / (luminance + 0.05);
}

describe("avatarFill", () => {
  it("gives one name one colour", () => {
    expect(avatarFill("Ann Lee")).toBe(avatarFill("Ann Lee"));
    expect(avatarFill("Ann Lee")).toBe(`hsl(${avatarHue("Ann Lee")} 50% 30%)`);
  });

  it("keeps white initials readable on every hue", () => {
    for (let hue = 0; hue < 360; hue++) {
      expect(whiteContrast(hue, AVATAR_SL.saturation, AVATAR_SL.lightness)).toBeGreaterThanOrEqual(
        4.5,
      );
    }
  });
});
