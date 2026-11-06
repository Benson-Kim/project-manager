/**
 * The quick calculator's sums: numbers (also 1.5e3), + - * / (also × ÷ −), mod, ^,
 * brackets, %, n!, the constants π, e, τ and φ, the last answer as ans, and functions
 * such as sin( or nCr(5, 2). A small recursive-descent parser, so typed text is never
 * run as code, and names are looked up in Maps, so "constructor" is only an unknown
 * word. % works as on a pocket calculator: 200 + 10% is 220, 200 * 10% is 20, 10%
 * alone is 0.1. Commas group thousands (1,200.50) so figures copied from the page work
 * as typed; inside a function's brackets a comma (or ;) separates its values instead,
 * and so does a comma written with a space beside it. A value directly before a
 * bracket or a name multiplies it: 2π, 3(4), 2sin(30). Minus binds looser than a
 * power: -2^2 is -4, and powers run right to left: 2^3^2 is 512.
 */
export type ExpressionError = "empty" | "invalid" | "divideByZero" | "noAnswer" | "tooLarge";
export type ExpressionResult = { ok: true; value: number } | { ok: false; error: ExpressionError };
export type AngleUnit = "deg" | "rad";

export const MAX_EXPRESSION_LENGTH = 200;
/** The calculator's keypad, in its four-column order; every key is one the parser reads. */
export const KEYPAD = [
  "7",
  "8",
  "9",
  "÷",
  "4",
  "5",
  "6",
  "×",
  "1",
  "2",
  "3",
  "-",
  "0",
  ".",
  "%",
  "+",
];

/** The scientific keys, in their four-column order; the block's last cell is the angle switch. */
export const SCIENTIFIC_KEYS = [
  { id: "sine", label: "sin", insert: "sin(" },
  { id: "cosine", label: "cos", insert: "cos(" },
  { id: "tangent", label: "tan", insert: "tan(" },
  { id: "squareRoot", label: "√", insert: "√(" },
  { id: "inverseSine", label: "sin⁻¹", insert: "asin(" },
  { id: "inverseCosine", label: "cos⁻¹", insert: "acos(" },
  { id: "inverseTangent", label: "tan⁻¹", insert: "atan(" },
  { id: "square", label: "x²", insert: "^2" },
  { id: "power", label: "xʸ", insert: "^" },
  { id: "log", label: "log", insert: "log(" },
  { id: "naturalLog", label: "ln", insert: "ln(" },
  { id: "factorial", label: "n!", insert: "!" },
  { id: "pi", label: "π", insert: "π" },
  { id: "euler", label: "e", insert: "e" },
  { id: "absolute", label: "|x|", insert: "abs(" },
] as const;

const COMMA_KEY = { id: "comma", label: ",", insert: ", " } as const;

/** The three keypad pages the page key cycles through; page 1 is the scientific keys above. */
export const SCIENTIFIC_PAGES = [
  SCIENTIFIC_KEYS,
  [
    { id: "combinations", label: "nCr", insert: "nCr(" },
    { id: "permutations", label: "nPr", insert: "nPr(" },
    { id: "gcd", label: "gcd", insert: "gcd(" },
    { id: "lcm", label: "lcm", insert: "lcm(" },
    { id: "hypotenuse", label: "hyp", insert: "hypot(" },
    { id: "cubeRoot", label: "∛", insert: "cbrt(" },
    { id: "percentOf", label: "pct", insert: "pct(" },
    { id: "truncate", label: "trunc", insert: "trunc(" },
    { id: "absolute", label: "|x|", insert: "abs(" },
    COMMA_KEY,
  ],
  [
    { id: "sinh", label: "sinh", insert: "sinh(" },
    { id: "cosh", label: "cosh", insert: "cosh(" },
    { id: "tanh", label: "tanh", insert: "tanh(" },
    { id: "log2", label: "log₂", insert: "log2(" },
    { id: "exponential", label: "eˣ", insert: "exp(" },
    { id: "goldenRatio", label: "φ", insert: "φ" },
    { id: "total", label: "sum", insert: "sum(" },
    { id: "mean", label: "mean", insert: "mean(" },
    { id: "standardDeviation", label: "σ", insert: "stdev(" },
    COMMA_KEY,
  ],
] as const;

export type ScientificKeyId = (typeof SCIENTIFIC_PAGES)[number][number]["id"];
export const PAGE_KEY_LABELS = ["2nd", "3rd", "1st"] as const;

const CARRIES_ON = /^\s*(?:[+\-*/^%!)×÷−]|mod\b)/;

/** What a key leaves in the box: after =, an operator carries on from the answer and anything else starts afresh. */
export function sumAfterKey(sum: string, key: string, afterEquals: boolean): string | null {
  if (!afterEquals) return null;
  return (CARRIES_ON.test(key) ? sum + key : key).slice(0, MAX_EXPRESSION_LENGTH);
}

/** ± on the box: flips a lone number, otherwise wraps the sum in -( ) or takes that wrap off again. */
export function toggleSign(sum: string): string {
  const text = sum.trim();
  if (!text) return "-";
  if (/^-?[\d.,]+(?:e[+-]?\d+)?$/.test(text))
    return text.startsWith("-") ? text.slice(1) : `-${text}`;
  if (text.startsWith("-(") && closesAtEnd(text.slice(1))) return text.slice(2, -1);
  return `-(${text})`.slice(0, MAX_EXPRESSION_LENGTH);
}

function closesAtEnd(text: string): boolean {
  let depth = 0;
  for (let index = 0; index < text.length; index++) {
    if (text[index] === "(") depth++;
    else if (text[index] === ")" && --depth === 0) return index === text.length - 1;
  }
  return false;
}

export type TapeEntry = { sum: string; value: number };
export const MAX_TAPE = 60;

/** The tape keeps the newest answer first and drops the oldest past its length. */
export function addToTape(tape: readonly TapeEntry[], entry: TapeEntry): TapeEntry[] {
  return [entry, ...tape].slice(0, MAX_TAPE);
}

const EXPONENT = "(?:e[+-]?\\d+)?";
const NUMBER = new RegExp(
  `^(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d*)?${EXPONENT}|^\\.\\d+${EXPONENT}`,
);
const PLAIN_NUMBER = new RegExp(`^\\d+(?:\\.\\d*)?${EXPONENT}|^\\.\\d+${EXPONENT}`);
const NAME = /^(?:[a-z_]+\d*|π|√|∛|τ|φ)/;
const LETTERS = /^[a-z_]+/;
const IMPLIED_MULTIPLY = /[a-zπ√∛τφ(]/;
const SYMBOLS: Record<string, string> = { "×": "*", "÷": "/", "−": "-", "–": "-", "—": "-" };
const MAX_FACTORIAL = 170;
const MAX_ARGUMENTS = 32;
const TAN_POLE = 1e-12;

const toRadians = (x: number, unit: AngleUnit) => (unit === "deg" ? (x * Math.PI) / 180 : x);
const fromRadians = (x: number, unit: AngleUnit) => (unit === "deg" ? (x * 180) / Math.PI : x);

const CONSTANTS = new Map<string, number>([
  ["pi", Math.PI],
  ["π", Math.PI],
  ["e", Math.E],
  ["tau", 2 * Math.PI],
  ["τ", 2 * Math.PI],
  ["phi", (1 + Math.sqrt(5)) / 2],
  ["φ", (1 + Math.sqrt(5)) / 2],
]);

type MathFunction = {
  min: number;
  max: number;
  run: (values: number[], unit: AngleUnit) => number;
};
const one = (run: (x: number, unit: AngleUnit) => number): MathFunction => ({
  min: 1,
  max: 1,
  run: ([x], unit) => run(x!, unit),
});
const two = (run: (a: number, b: number) => number): MathFunction => ({
  min: 2,
  max: 2,
  run: ([a, b]) => run(a!, b!),
});
const list = (min: number, run: (values: number[]) => number): MathFunction => ({
  min,
  max: MAX_ARGUMENTS,
  run,
});

const isWhole = (...values: number[]) => values.every((x) => Number.isInteger(x) && x >= 0);
const total = (values: number[]) => values.reduce((sum, x) => sum + x, 0);
const average = (values: number[]) => total(values) / values.length;
const spread = (values: number[], divisor: number) => {
  const mean = average(values);
  return Math.sqrt(total(values.map((x) => (x - mean) ** 2)) / divisor);
};

function middle(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const half = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[half - 1]! + sorted[half]!) / 2 : sorted[half]!;
}

function choose(n: number, r: number): number {
  if (!isWhole(n, r) || r > n) return NaN;
  let answer = 1;
  for (let i = 0; i < Math.min(r, n - r); i++) answer = (answer * (n - i)) / (i + 1);
  return Math.round(answer);
}

function arrange(n: number, r: number): number {
  if (!isWhole(n, r) || r > n) return NaN;
  let answer = 1;
  for (let i = 0; i < r; i++) answer *= n - i;
  return answer;
}

function gcd(a: number, b: number): number {
  if (!Number.isInteger(a) || !Number.isInteger(b)) return NaN;
  let [x, y] = [Math.abs(a), Math.abs(b)];
  while (y > 0) [x, y] = [y, x % y];
  return x;
}

function lcm(a: number, b: number): number {
  if (a === 0 || b === 0) return Number.isInteger(a) && Number.isInteger(b) ? 0 : NaN;
  return Math.abs(a * b) / gcd(a, b);
}

function roundTo(x: number, places = 0): number {
  if (!Number.isInteger(places) || places < -15 || places > 10) return NaN;
  const factor = 10 ** places;
  return Math.round(x * factor) / factor;
}

function logarithm(x: number, base = 10): number {
  if (x <= 0 || base <= 0 || base === 1) return NaN;
  return base === 10 ? Math.log10(x) : Math.log(x) / Math.log(base);
}

/** NaN means the function has no answer there. */
const FUNCTIONS = new Map<string, MathFunction>([
  ["sin", one((x, unit) => Math.sin(toRadians(x, unit)))],
  ["cos", one((x, unit) => Math.cos(toRadians(x, unit)))],
  [
    "tan",
    one((x, unit) => {
      const angle = toRadians(x, unit);
      return Math.abs(Math.cos(angle)) < TAN_POLE ? NaN : Math.tan(angle);
    }),
  ],
  ["asin", one((x, unit) => fromRadians(Math.asin(x), unit))],
  ["acos", one((x, unit) => fromRadians(Math.acos(x), unit))],
  ["atan", one((x, unit) => fromRadians(Math.atan(x), unit))],
  ["sinh", one(Math.sinh)],
  ["cosh", one(Math.cosh)],
  ["tanh", one(Math.tanh)],
  ["asinh", one(Math.asinh)],
  ["acosh", one(Math.acosh)],
  ["atanh", one((x) => (Math.abs(x) < 1 ? Math.atanh(x) : NaN))],
  ["sqrt", one(Math.sqrt)],
  ["√", one(Math.sqrt)],
  ["cbrt", one(Math.cbrt)],
  ["∛", one(Math.cbrt)],
  ["log", { min: 1, max: 2, run: ([x, base]) => logarithm(x!, base) }],
  ["log2", one((x) => logarithm(x, 2))],
  ["ln", one((x) => logarithm(x, Math.E))],
  ["exp", one(Math.exp)],
  ["abs", one(Math.abs)],
  ["sign", one(Math.sign)],
  ["round", { min: 1, max: 2, run: ([x, places]) => roundTo(x!, places) }],
  ["floor", one(Math.floor)],
  ["ceil", one(Math.ceil)],
  ["trunc", one(Math.trunc)],
  ["fact", one((x) => factorial(x))],
  ["ncr", two(choose)],
  ["npr", two(arrange)],
  ["gcd", two(gcd)],
  ["lcm", two(lcm)],
  ["pct", two((rate, x) => (rate / 100) * x)],
  ["hypot", list(2, (values) => Math.hypot(...values))],
  ["min", list(1, (values) => Math.min(...values))],
  ["max", list(1, (values) => Math.max(...values))],
  ["sum", list(1, total)],
  ["mean", list(1, average)],
  ["avg", list(1, average)],
  ["median", list(1, middle)],
  ["stdev", list(2, (values) => spread(values, values.length - 1))],
  ["stdevp", list(1, (values) => spread(values, values.length))],
  ["rad", one((x) => toRadians(x, "deg"))],
  ["deg", one((x) => fromRadians(x, "deg"))],
]);

class Invalid extends Error {
  constructor(readonly code: ExpressionError) {
    super(code);
  }
}

type Term = { value: number; percent: boolean };

function checked(value: number): number {
  if (Number.isNaN(value)) throw new Invalid("noAnswer");
  if (!Number.isFinite(value)) throw new Invalid("tooLarge");
  return value;
}

function factorial(n: number): number {
  if (n < 0 || !Number.isInteger(n)) throw new Invalid("noAnswer");
  if (n > MAX_FACTORIAL) throw new Invalid("tooLarge");
  let answer = 1;
  for (let i = 2; i <= n; i++) answer *= i;
  return answer;
}

export function evaluateExpression(
  text: string,
  { angle = "deg", ans = 0 }: { angle?: AngleUnit; ans?: number } = {},
): ExpressionResult {
  const source = text
    .replace(/[×÷−–—]/g, (s) => SYMBOLS[s]!)
    .replace(/\s*,\s*/g, (s) => (s === "," ? "," : ";"))
    .replace(/\s+/g, "")
    .toLowerCase();
  if (source === "") return { ok: false, error: "empty" };
  if (text.length > MAX_EXPRESSION_LENGTH || /[\d.]\s+[\d.]/.test(text)) {
    return { ok: false, error: "invalid" };
  }
  let at = 0;
  let inArguments = 0;

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
      value = checked(op === "+" ? value + amount : value - amount);
    }
  }

  function product(): Term {
    let term = unary();
    for (;;) {
      const op = source.startsWith("mod", at) ? "mod" : peek();
      if (op === "*" || op === "/" || op === "mod") at += op.length;
      else if (op === undefined || !IMPLIED_MULTIPLY.test(op)) return term;
      const right = unary().value;
      if ((op === "/" || op === "mod") && right === 0) throw new Invalid("divideByZero");
      const answer =
        op === "/" ? term.value / right : op === "mod" ? term.value % right : term.value * right;
      term = { value: checked(answer), percent: false };
    }
  }

  function unary(): Term {
    if (take("-")) {
      const term = unary();
      return { value: -term.value, percent: term.percent };
    }
    if (take("+")) return unary();
    return power();
  }

  function power(): Term {
    const base = postfix();
    if (!take("^")) return base;
    const exponent = unary().value;
    if (base.value === 0 && exponent < 0) throw new Invalid("divideByZero");
    return { value: checked(base.value ** exponent), percent: false };
  }

  function postfix(): Term {
    let term: Term = { value: primary(), percent: false };
    for (;;) {
      if (take("%")) term = { value: term.value / 100, percent: true };
      else if (take("!")) term = { value: factorial(term.value), percent: false };
      else return term;
    }
  }

  function bracket(): number {
    const value = sum();
    if (!take(")")) throw new Invalid("invalid");
    return value;
  }

  function call(fn: MathFunction): number {
    inArguments++;
    const values = [sum()];
    while (take(",") || take(";")) values.push(sum());
    inArguments--;
    if (!take(")") || values.length < fn.min || values.length > fn.max) {
      throw new Invalid("invalid");
    }
    return checked(fn.run(values, angle));
  }

  function word(): string | undefined {
    const rest = source.slice(at);
    const name = NAME.exec(rest)?.[0];
    if (!name || CONSTANTS.has(name) || FUNCTIONS.has(name)) return name;
    return LETTERS.exec(rest)?.[0] ?? name;
  }

  function primary(): number {
    if (take("(")) return bracket();
    const name = word();
    if (name) {
      at += name.length;
      if (name === "ans") return ans;
      const constant = CONSTANTS.get(name);
      if (constant !== undefined) return constant;
      const fn = FUNCTIONS.get(name);
      if (!fn || !take("(")) throw new Invalid("invalid");
      return call(fn);
    }
    const match = (inArguments > 0 ? PLAIN_NUMBER : NUMBER).exec(source.slice(at));
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
const GROUPED = new Intl.NumberFormat("en-US", { maximumFractionDigits: 10 });
const SCIENTIFIC = new Intl.NumberFormat("en-US", {
  notation: "scientific",
  maximumFractionDigits: 10,
});
const SHOWN_IN_FULL_BELOW = 1e21;

/** An answer put back in the box: plain digits (never 1e-7), so it reads back as a sum. */
export function toSumText(value: number): string {
  return PLAIN.format(value);
}

/** An answer on show: grouped digits, or 7.26E306 once the digits would not fit a line. */
export function toShownText(value: number): string {
  return (Math.abs(value) < SHOWN_IN_FULL_BELOW ? GROUPED : SCIENTIFIC).format(value);
}

/** What = leaves in the box: the answer, unless it is too long to read back as a sum. */
export function sumAfterEquals(sum: string, value: number): string {
  const answer = toSumText(value);
  return answer.length > MAX_EXPRESSION_LENGTH ? sum : answer;
}

/** Drops binary float noise (0.1 + 0.2 shows 0.3) without rounding real digits. */
function tidy(value: number): number {
  const fixed = Math.abs(value) < 1e21 ? Number(value.toFixed(10)) : value;
  return Object.is(fixed, -0) ? 0 : fixed;
}
