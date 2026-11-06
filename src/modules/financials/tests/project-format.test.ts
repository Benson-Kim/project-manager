import { describe, expect, it } from "vitest";
import {
  formatCurrency,
  formatDay,
  formatDecimal,
  formatNumber,
  formatSignedPercent,
} from "../calc/project-format";

describe("formatNumber", () => {
  it("groups thousands and keeps the fraction", () => {
    expect(formatNumber(143_750)).toBe("143,750");
    expect(formatNumber(1_234.5678)).toBe("1,234.5678");
  });

  it("shows zero, missing and infinite values", () => {
    expect(formatNumber(0)).toBe("0");
    expect(formatNumber(null)).toBe("—");
    expect(formatNumber(undefined)).toBe("—");
    expect(formatNumber(Number.NaN)).toBe("—");
    expect(formatNumber(Number.POSITIVE_INFINITY)).toBe("∞");
    expect(formatNumber(Number.NEGATIVE_INFINITY)).toBe("−∞");
  });

  it("writes very large and very small values in exponent form", () => {
    expect(formatNumber(1e20)).toBe("1e20");
    expect(formatNumber(1e-12)).toBe("1e-12");
  });

  it("hides floating-point noise", () => {
    expect(formatNumber(0.1 + 0.2)).toBe("0.3");
  });
});

describe("formatCurrency", () => {
  it("puts the minus sign outside the symbol", () => {
    expect(formatCurrency(-45_455)).toBe("−$45,455");
    expect(formatCurrency(295_455)).toBe("$295,455");
  });

  it("takes digits and a symbol", () => {
    expect(formatCurrency(12.5, { digits: 2 })).toBe("$12.50");
    expect(formatCurrency(1_000, { symbol: "€" })).toBe("€1,000");
  });

  it("shows a dash for a missing value", () => {
    expect(formatCurrency(null)).toBe("—");
  });
});

describe("formatDecimal", () => {
  it("rounds to the digits asked for", () => {
    expect(formatDecimal(0.8461538, 2)).toBe("0.85");
    expect(formatDecimal(21, 0)).toBe("21");
  });

  it("shows a dash for a missing value", () => {
    expect(formatDecimal(null)).toBe("—");
  });
});

describe("formatSignedPercent", () => {
  it("signs gains and losses, and leaves zero unsigned", () => {
    expect(formatSignedPercent(9.375)).toBe("+9.4%");
    expect(formatSignedPercent(-4.2)).toBe("−4.2%");
    expect(formatSignedPercent(0)).toBe("0.0%");
    expect(formatSignedPercent(null)).toBe("—");
  });

  it("drops the plus sign when unsigned, but keeps the minus", () => {
    expect(formatSignedPercent(93.2, 0, { signed: false })).toBe("93%");
    expect(formatSignedPercent(-4.2, 1, { signed: false })).toBe("−4.2%");
  });
});

describe("formatDay", () => {
  it("shows the weekday and the ISO date", () => {
    expect(formatDay(Date.UTC(2026, 10, 6))).toBe("Fri 2026-11-06");
  });

  it("shows a dash for a missing day", () => {
    expect(formatDay(null)).toBe("—");
  });
});
