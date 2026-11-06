import { describe, expect, it } from "vitest";
import {
  addToTape,
  evaluateExpression,
  MAX_EXPRESSION_LENGTH,
  MAX_TAPE,
  PAGE_KEY_LABELS,
  SCIENTIFIC_PAGES,
  sumAfterKey,
  toggleSign,
} from "../calc/expression";
import { messages } from "@/lib/messages";

const M = messages.financials.quickCalculator;

function value(sum: string) {
  const result = evaluateExpression(sum, { angle: "deg" });
  return result.ok ? result.value : result.error;
}

describe("keypad pages", () => {
  it("has three pages, a page-key label and a hint for each", () => {
    expect(SCIENTIFIC_PAGES).toHaveLength(3);
    expect(PAGE_KEY_LABELS).toHaveLength(3);
    expect(M.pages).toHaveLength(3);
  });

  it("names every key for screen readers", () => {
    for (const key of SCIENTIFIC_PAGES.flat()) expect(M.keys[key.id]).toBeTruthy();
  });

  it.each([
    ["nCr(5, 2)", 10],
    ["nPr(5, 2)", 20],
    ["gcd(12, 18)", 6],
    ["lcm(4, 6)", 12],
    ["hypot(3, 4)", 5],
    ["cbrt(27)", 3],
    ["trunc(-2.7)", -2],
    ["abs(-3)", 3],
    ["sinh(0)", 0],
    ["cosh(0)", 1],
    ["tanh(0)", 0],
    ["log2(8)", 3],
    ["exp(0)", 1],
    ["sum(1, 2, 3)", 6],
    ["mean(2, 4)", 3],
  ])("reads %s as typed by the page keys", (sum, expected) => {
    expect(value(sum)).toBeCloseTo(expected, 10);
  });

  it("reads φ, pct and stdev as the page keys type them", () => {
    expect(value("φ")).toBeCloseTo((1 + Math.sqrt(5)) / 2, 10);
    expect(typeof value("pct(25, 200)")).toBe("number");
    expect(typeof value("stdev(2, 4, 4, 4, 5, 5, 7, 9)")).toBe("number");
  });

  it("types a comma that separates values inside brackets", () => {
    const comma = SCIENTIFIC_PAGES[1].find((key) => key.id === "comma");
    expect(value(`gcd(8${comma?.insert}12)`)).toBe(4);
  });
});

describe("sumAfterKey", () => {
  it("leaves typing alone until = has been pressed", () => {
    expect(sumAfterKey("12", "3", false)).toBeNull();
  });

  it("carries on from the answer with an operator", () => {
    expect(sumAfterKey("12", "+", true)).toBe("12+");
    expect(sumAfterKey("12", "×", true)).toBe("12×");
    expect(sumAfterKey("12", "!", true)).toBe("12!");
  });

  it("starts afresh with a number or a function", () => {
    expect(sumAfterKey("12", "3", true)).toBe("3");
    expect(sumAfterKey("12", "sin(", true)).toBe("sin(");
  });

  it("never grows past the longest sum", () => {
    expect(sumAfterKey("9".repeat(MAX_EXPRESSION_LENGTH), "+", true)).toHaveLength(
      MAX_EXPRESSION_LENGTH,
    );
  });
});

describe("toggleSign", () => {
  it("flips a lone number", () => {
    expect(toggleSign("12.5")).toBe("-12.5");
    expect(toggleSign("-12.5")).toBe("12.5");
    expect(toggleSign("")).toBe("-");
  });

  it("wraps a sum and takes its own wrap off again", () => {
    expect(toggleSign("2+3")).toBe("-(2+3)");
    expect(toggleSign("-(2+3)")).toBe("2+3");
  });

  it("does not unwrap brackets that close before the end", () => {
    expect(toggleSign("-(2)+(3)")).toBe("-(-(2)+(3))");
    expect(value(toggleSign("-(2)+(3)"))).toBe(-1);
  });
});

describe("addToTape", () => {
  it("puts the newest answer first and keeps the tape short", () => {
    let tape = addToTape([], { sum: "1+1", value: 2 });
    tape = addToTape(tape, { sum: "2+2", value: 4 });
    expect(tape.map((entry) => entry.value)).toEqual([4, 2]);
    for (let index = 0; index < MAX_TAPE + 5; index++)
      tape = addToTape(tape, { sum: "1", value: 1 });
    expect(tape).toHaveLength(MAX_TAPE);
  });
});
