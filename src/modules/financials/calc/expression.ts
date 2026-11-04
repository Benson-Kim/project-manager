/**
 * The quick calculator's sums: numbers, + - * / (also × ÷ −), brackets and %.
 * A small recursive-descent parser, so typed text is never run as code. % works
 * as on a pocket calculator: 200 + 10% is 220, 200 * 10% is 20, 10% alone is 0.1.
 * Commas group thousands (1,200.50) so figures copied from the page work as typed.
 * The length cap keeps every result finite: 200 characters cannot reach 1e308.
 */
export type ExpressionError = "empty" | "invalid" | "divideByZero";
export type ExpressionResult = { ok: true; value: number } | { ok: false; error: ExpressionError };

export const MAX_EXPRESSION_LENGTH = 200;

const NUMBER = /^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d*)?|^\.\d+/;
const SYMBOLS: Record<string, string> = { "×": "*", "÷": "/", "−": "-" };

class Invalid extends Error {
  constructor(readonly code: ExpressionError) {
    super(code);
  }
}

type Term = { value: number; percent: boolean };

export function evaluateExpression(text: string): ExpressionResult {
  const source = text.replace(/[×÷−]/g, (s) => SYMBOLS[s]!).replace(/\s+/g, "");
  if (source === "") return { ok: false, error: "empty" };
  if (text.length > MAX_EXPRESSION_LENGTH || /[\d.,]\s+[\d.,]/.test(text)) {
    return { ok: false, error: "invalid" };
  }
  let at = 0;

  const peek = () => source[at];
  const take = (char: string) => (source[at] === char ? (at++, true) : false);

  function sum(): number {
    let value = product().value;
    for (;;) {
      const op = peek();
      if (op !== "+" && op !== "-") return value;
      at++;
      const right = product();
      const amount = right.percent ? value * right.value : right.value;
      value = op === "+" ? value + amount : value - amount;
    }
  }

  function product(): Term {
    let term = unary();
    for (;;) {
      const op = peek();
      if (op !== "*" && op !== "/") return term;
      at++;
      const right = unary().value;
      if (op === "/" && right === 0) throw new Invalid("divideByZero");
      term = { value: op === "*" ? term.value * right : term.value / right, percent: false };
    }
  }

  function unary(): Term {
    if (take("-")) {
      const term = unary();
      return { value: -term.value, percent: term.percent };
    }
    if (take("+")) return unary();
    let value = primary();
    let percent = false;
    while (take("%")) {
      value /= 100;
      percent = true;
    }
    return { value, percent };
  }

  function primary(): number {
    if (take("(")) {
      const value = sum();
      if (!take(")")) throw new Invalid("invalid");
      return value;
    }
    const match = NUMBER.exec(source.slice(at));
    if (!match) throw new Invalid("invalid");
    at += match[0].length;
    return Number(match[0].replace(/,/g, ""));
  }

  try {
    const value = sum();
    if (at !== source.length) return { ok: false, error: "invalid" };
    return { ok: true, value: tidy(value) };
  } catch (error) {
    if (error instanceof Invalid) return { ok: false, error: error.code };
    throw error;
  }
}

const PLAIN = new Intl.NumberFormat("en-US", { maximumFractionDigits: 10, useGrouping: false });

/** An answer put back in the box: plain digits (never 1e-7), so it reads back as a sum. */
export function toSumText(value: number): string {
  return PLAIN.format(value);
}

/** Drops binary float noise (0.1 + 0.2 shows 0.3) without rounding real digits. */
function tidy(value: number): number {
  const fixed = Math.abs(value) < 1e21 ? Number(value.toFixed(10)) : value;
  return Object.is(fixed, -0) ? 0 : fixed;
}
