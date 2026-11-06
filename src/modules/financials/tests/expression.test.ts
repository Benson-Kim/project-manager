import { describe, expect, it } from "vitest";
import {
  evaluateExpression,
  KEYPAD,
  MAX_EXPRESSION_LENGTH,
  SCIENTIFIC_KEYS,
  sumAfterEquals,
  toShownText,
  toSumText,
} from "../calc/expression";

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

  it("reads every keypad key: 4 key 5 is a sum, or 45 for a digit", () => {
    const sums = { "÷": 0.8, "×": 20, "-": -1, "+": 9, ".": 4.5, "%": 0.2 };
    for (const key of KEYPAD) {
      const want = key in sums ? sums[key as keyof typeof sums] : Number(`4${key}5`);
      expect(value(key === "%" ? "4% × 5" : `4${key}5`), key).toBe(want);
    }
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
      "abc",
      "alert(1)",
      "constructor",
      "Math.PI",
      "0x10",
    ]) {
      expect(error(junk), junk).toBe("invalid");
    }
  });

  it("tells an empty box apart, and keeps long plain sums working", () => {
    expect(error("   ")).toBe("empty");
    expect(value(`${"9".repeat(99)}*${"9".repeat(100)}`)).toBeGreaterThan(1e198);
  });

  it("refuses a sum longer than the box allows", () => {
    expect(error("1+".repeat(MAX_EXPRESSION_LENGTH) + "1")).toBe("invalid");
  });
});

describe("evaluateExpression, scientific", () => {
  const rad = (text: string) => evaluateExpression(text, { angle: "rad" });

  it("works in degrees unless told otherwise", () => {
    expect(value("sin(30)")).toBe(0.5);
    expect(value("cos(60)")).toBe(0.5);
    expect(value("tan(45)")).toBe(1);
    expect(value("cos(90)")).toBe(0);
    expect(value("sin(180)")).toBe(0);
    expect(value("asin(1)")).toBe(90);
    expect(value("acos(0)")).toBe(90);
    expect(value("atan(1)")).toBe(45);
  });

  it("works in radians when told to", () => {
    expect(rad("sin(π/2)")).toEqual({ ok: true, value: 1 });
    expect(rad("cos(π)")).toEqual({ ok: true, value: -1 });
    expect(rad("asin(1)")).toEqual({ ok: true, value: 1.5707963268 });
    expect(rad("sin(30)")).toEqual({ ok: true, value: -0.9880316241 });
  });

  it("knows roots, logarithms, absolute values and constants", () => {
    expect(value("sqrt(144)")).toBe(12);
    expect(value("√(16)")).toBe(4);
    expect(value("log(1000)")).toBe(3);
    expect(value("ln(e)")).toBe(1);
    expect(value("abs(-7.5)")).toBe(7.5);
    expect(value("π")).toBe(3.1415926536);
    expect(value("pi")).toBe(3.1415926536);
    expect(value("e")).toBe(2.7182818285);
  });

  it("reads names in any case", () => {
    expect(value("SIN(30)")).toBe(0.5);
    expect(value("Pi")).toBe(3.1415926536);
  });

  it("puts powers above minus and multiply, running right to left", () => {
    expect(value("2^10")).toBe(1024);
    expect(value("2^3^2")).toBe(512);
    expect(value("-2^2")).toBe(-4);
    expect(value("(-2)^2")).toBe(4);
    expect(value("2^-1")).toBe(0.5);
    expect(value("3 * 2^2")).toBe(12);
    expect(value("9^0.5")).toBe(3);
  });

  it("takes factorials of whole numbers", () => {
    expect(value("0!")).toBe(1);
    expect(value("5!")).toBe(120);
    expect(value("-3!")).toBe(-6);
    expect(value("3!!")).toBe(720);
    expect(value("2^3!")).toBe(64);
  });

  it("multiplies without a sign only before a bracket, a name, π or √", () => {
    expect(value("2π")).toBe(6.2831853072);
    expect(value("2(3 + 4)")).toBe(14);
    expect(value("(2)(3)")).toBe(6);
    expect(value("2sin(30)")).toBe(1);
    expect(value("3√(4)")).toBe(6);
    expect(value("2(3)^2")).toBe(18);
    expect(value("1 + 2π / π")).toBe(3);
    for (const junk of ["(2)3", "2π3", "10%5", "2 3", "e2", "sin 30", "sin30", "sin", "√9"]) {
      expect(error(junk), junk).toBe("invalid");
    }
  });

  it("keeps the pocket-calculator % alongside the new keys", () => {
    expect(value("200 + 10%")).toBe(220);
    expect(value("10%^2")).toBe(0.01);
    expect(value("200 + (2^2)%")).toBe(208);
  });

  it("says when there is no answer", () => {
    for (const none of [
      "sqrt(-1)",
      "√(-4)",
      "log(0)",
      "log(-1)",
      "ln(0)",
      "asin(2)",
      "acos(-2)",
      "tan(90)",
      "tan(270)",
      "(-8)^(1/3)",
      "(-1)!",
      "1.5!",
    ]) {
      expect(error(none), none).toBe("noAnswer");
    }
    expect(rad("tan(π/2)")).toEqual({ ok: false, error: "noAnswer" });
  });

  it("says when an answer is too large, even in the middle of a sum", () => {
    for (const huge of ["10^400", "171!", "(10^308)*10", "1 / 10^400", "(10^308) + (10^308)"]) {
      expect(error(huge), huge).toBe("tooLarge");
    }
    expect(value("170!")).toBeGreaterThan(1e306);
  });

  it("refuses zero to a negative power as a division by zero", () => {
    expect(error("0^-1")).toBe("divideByZero");
    expect(value("0^0")).toBe(1);
  });

  it("never reaches into Object.prototype for a name", () => {
    for (const name of ["constructor(1)", "tostring(1)", "__proto__", "valueof"]) {
      expect(error(name), name).toBe("invalid");
    }
  });

  it("reads what every scientific key types", () => {
    for (const key of SCIENTIFIC_KEYS) {
      const sum = key.insert.endsWith("(")
        ? `${key.insert}1)`
        : /^[\^!]/.test(key.insert)
          ? `2${key.insert}${key.insert === "^" ? "3" : ""}`
          : key.insert;
      expect(evaluateExpression(sum).ok, key.id).toBe(true);
    }
  });
});

describe("evaluateExpression, the second and third key pages", () => {
  it("reads numbers written with an exponent, and keeps 2e as 2 × e", () => {
    expect(value("1.5e3")).toBe(1500);
    expect(value("1E3")).toBe(1000);
    expect(value("2e-3")).toBe(0.002);
    expect(value("2e")).toBe(5.4365636569);
    expect(value("2exp(0)")).toBe(2);
  });

  it("takes mod beside multiply and divide", () => {
    expect(value("7 mod 3")).toBe(1);
    expect(value("2 + 7 mod 3 * 2")).toBe(4);
    expect(error("7 mod 0")).toBe("divideByZero");
  });

  it("separates a function's values with commas, and groups thousands outside one", () => {
    expect(value("gcd(84,36)")).toBe(12);
    expect(value("lcm(4,6)")).toBe(12);
    expect(value("hypot(3,4)")).toBe(5);
    expect(value("hypot(3, 4, 12)")).toBe(13);
    expect(value("nCr(5,2)")).toBe(10);
    expect(value("nPr(5,2)")).toBe(20);
    expect(value("nCr(0,0)")).toBe(1);
    expect(value("nCr(52,5)")).toBe(2598960);
    expect(value("pct(15,8200)")).toBe(1230);
    expect(value("sum(1,2,3,4)")).toBe(10);
    expect(value("sum(1, 200)")).toBe(201);
    expect(value("sum(1 ,2)")).toBe(3);
    expect(value("sum(1;2)")).toBe(3);
    expect(value("min(3,1,2)")).toBe(1);
    expect(value("max(3,1,2)")).toBe(3);
    expect(value("1,200 + sum(1,2)")).toBe(1203);
  });

  it("knows the hyperbolics, logs, roots and rounding", () => {
    expect(value("sinh(0)")).toBe(0);
    expect(value("cosh(0)")).toBe(1);
    expect(value("tanh(0)")).toBe(0);
    expect(value("asinh(0)")).toBe(0);
    expect(value("acosh(1)")).toBe(0);
    expect(value("atanh(0)")).toBe(0);
    expect(value("log2(8)")).toBe(3);
    expect(value("log(81, 3)")).toBe(4);
    expect(value("exp(0)")).toBe(1);
    expect(value("cbrt(27)")).toBe(3);
    expect(value("∛(-8)")).toBe(-2);
    expect(value("round(2.567, 2)")).toBe(2.57);
    expect(value("round(2.5)")).toBe(3);
    expect(value("round(1234, -2)")).toBe(1200);
    expect(value("floor(2.7)")).toBe(2);
    expect(value("ceil(2.1)")).toBe(3);
    expect(value("trunc(-2.7)")).toBe(-2);
    expect(value("sign(-3)")).toBe(-1);
    expect(value("fact(5)")).toBe(120);
  });

  it("summarises a list of values", () => {
    expect(value("mean(2,4,6)")).toBe(4);
    expect(value("avg(2,4,6)")).toBe(4);
    expect(value("median(3,1,2)")).toBe(2);
    expect(value("median(4,1,3,2)")).toBe(2.5);
    expect(value("stdev(2,4,4,4,5,5,7,9)")).toBe(2.1380899353);
    expect(value("stdevp(2,4,4,4,5,5,7,9)")).toBe(2);
  });

  it("converts angles and knows τ and φ", () => {
    expect(value("rad(180)")).toBe(3.1415926536);
    expect(value("deg(π)")).toBe(180);
    expect(value("tau")).toBe(6.2831853072);
    expect(value("τ")).toBe(6.2831853072);
    expect(value("phi")).toBe(1.6180339887);
    expect(value("2φ")).toBe(3.2360679775);
  });

  it("reads the last answer as ans, 0 before there is one", () => {
    expect(evaluateExpression("ans * 2", { ans: 21 })).toEqual({ ok: true, value: 42 });
    expect(evaluateExpression("2ans", { ans: 3 })).toEqual({ ok: true, value: 6 });
    expect(value("ans")).toBe(0);
  });

  it("refuses the wrong number of values, and a separator outside a function", () => {
    for (const junk of [
      "nCr(5)",
      "sin(1, 2)",
      "hypot(3)",
      "stdev(2)",
      "log(1, 2, 3)",
      "sum()",
      "pct(1,2,3)",
      "mod 3",
      "7 mod",
      "1, 2",
      "(1;2)",
      "log10(100)",
    ]) {
      expect(error(junk), junk).toBe("invalid");
    }
  });

  it("says when there is no answer", () => {
    for (const none of [
      "nCr(2,5)",
      "nPr(5.5,2)",
      "nCr(-1,0)",
      "gcd(1.5,3)",
      "lcm(1.5,3)",
      "log(8, 1)",
      "log(8, -2)",
      "log2(0)",
      "acosh(0)",
      "atanh(1)",
      "round(1.234, 0.5)",
      "fact(-1)",
    ]) {
      expect(error(none), none).toBe("noAnswer");
    }
  });

  it("says when an answer is too large", () => {
    for (const huge of ["sinh(1000)", "exp(1000)", "fact(171)", "sum(1e308, 1e308)"]) {
      expect(error(huge), huge).toBe("tooLarge");
    }
  });
});

describe("toShownText", () => {
  it("groups digits, and uses scientific notation once they would not fit", () => {
    expect(toShownText(1234567.5)).toBe("1,234,567.5");
    expect(toShownText(1e20)).toBe("100,000,000,000,000,000,000");
    expect(toShownText(1e21)).toBe("1E21");
    expect(toShownText(-1e300)).toBe("-1E300");
  });
});

describe("sumAfterEquals", () => {
  it("swaps the sum for its answer", () => {
    expect(sumAfterEquals("2 + 2", 4)).toBe("4");
  });

  it("keeps the sum when the answer could not be read back", () => {
    expect(sumAfterEquals("170!", value("170!"))).toBe("170!");
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
