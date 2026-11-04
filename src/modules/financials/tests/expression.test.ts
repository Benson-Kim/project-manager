import { describe, expect, it } from "vitest";
import { evaluateExpression, MAX_EXPRESSION_LENGTH, toSumText } from "../calc/expression";

const value = (text: string) => {
  const result = evaluateExpression(text);
  if (!result.ok) throw new Error(`${text} -> ${result.error}`);
  return result.value;
};
const error = (text: string) => {
  const result = evaluateExpression(text);
  return result.ok ? `value ${result.value}` : result.error;
};

describe("evaluateExpression", () => {
  it("multiplies and divides before adding and subtracting, left to right", () => {
    expect(value("2 + 3 * 4")).toBe(14);
    expect(value("10 - 4 - 3")).toBe(3);
    expect(value("100 / 10 / 2")).toBe(5);
    expect(value("2 * 3 + 4 * 5")).toBe(26);
  });

  it("works out brackets first, nested too", () => {
    expect(value("(2 + 3) * 4")).toBe(20);
    expect(value("((1 + 1) * (2 + 3)) / 5")).toBe(2);
  });

  it("takes signs, decimals, the keypad symbols and grouped thousands", () => {
    expect(value("-5 + 2")).toBe(-3);
    expect(value("3 * -2")).toBe(-6);
    expect(value("-(2 + 3)")).toBe(-5);
    expect(value(".5 + 1.25")).toBe(1.75);
    expect(value("6 × 7 ÷ 2 − 1")).toBe(20);
    expect(value("1,200.50 * 2")).toBe(2401);
  });

  it("treats % like a pocket calculator", () => {
    expect(value("10%")).toBe(0.1);
    expect(value("200 + 10%")).toBe(220);
    expect(value("200 - 10%")).toBe(180);
    expect(value("200 * 10%")).toBe(20);
    expect(value("1000 + 16% + 0")).toBe(1160);
  });

  it("hides binary float noise", () => {
    expect(value("0.1 + 0.2")).toBe(0.3);
    expect(value("1.1 * 3")).toBe(3.3);
    expect(value("0 * -1")).toBe(0);
  });

  it("refuses to divide by zero, also by a zero sum", () => {
    expect(error("5 / 0")).toBe("divideByZero");
    expect(error("5 / (2 - 2)")).toBe("divideByZero");
  });

  it("refuses anything that is not a sum, and never runs it", () => {
    for (const junk of [
      "2 +",
      "* 3",
      "(1 + 2",
      "1 + 2)",
      "()",
      "1..2",
      "1,2",
      "1,2345",
      "2 3",
      "1e3",
      "abc",
      "alert(1)",
      "constructor",
      "Math.PI",
      "0x10",
    ]) {
      expect(error(junk), junk).toBe("invalid");
    }
  });

  it("tells an empty box apart, and keeps the longest sum finite", () => {
    expect(error("   ")).toBe("empty");
    expect(value(`${"9".repeat(99)}*${"9".repeat(100)}`)).toBeGreaterThan(1e198);
  });

  it("refuses a sum longer than the box allows", () => {
    expect(error("1+".repeat(MAX_EXPRESSION_LENGTH) + "1")).toBe("invalid");
  });
});

describe("toSumText", () => {
  it("writes an answer as plain digits that read back as the same sum", () => {
    expect(toSumText(4176)).toBe("4176");
    expect(toSumText(-1234.5)).toBe("-1234.5");
    expect(toSumText(value("1 / 10000000"))).toBe("0.0000001");
    for (const answer of [value("1 / 3"), value("1 / 10000000"), value("-2.5 * 4"), 1e21]) {
      expect(value(toSumText(answer))).toBe(answer);
    }
  });
});
