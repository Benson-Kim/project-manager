/**
 * Money and rates for the financials calculator (ADR-0029). Amounts are bigint
 * cents and rates bigint millionths ("micros": 0.056879 = 56879n), so no
 * figure ever passes through a binary float. Rounding is Excel's ROUND: half
 * away from zero, which the source workbook used on every tax-included cell.
 */
import { NO_CURRENCY, currencySymbol } from "@/lib/currency/currencies";

/** Largest amount one cell or invoice may hold: 999,999,999.99. */
export const MONEY_MAX_CENTS = 99_999_999_999n;

/** Largest rate: 100 %. */
export const RATE_MAX_MICROS = 1_000_000n;

const MICROS = 1_000_000n;

/** n / d rounded half away from zero (d > 0). */
export function divRound(n: bigint, d: bigint): bigint {
  const q = n / d;
  const r = n % d;
  const twice = (r < 0n ? -r : r) * 2n;
  if (twice < d) return q;
  return n < 0n ? q - 1n : q + 1n;
}

/** cents x (1 + rate), rounded to the cent: ROUND(ROUND(x,2)*(1+rate),2). */
export function applyRate(cents: bigint, rateMicros: bigint): bigint {
  return divRound(cents * (MICROS + rateMicros), MICROS);
}

/** rate x amount, rounded to the cent (a share of an amount, e.g. a 10 % threshold). */
export function shareOf(cents: bigint, rateMicros: bigint): bigint {
  return divRound(cents * rateMicros, MICROS);
}

const MONEY_TEXT = /^(-)?(\d{1,3}(?:[ , ]\d{3})+|\d+)(?:\.(\d{1,2}))?$/;

/**
 * Typed money ("1,234.5", "-12", "1 000.25") to cents; null when the text is
 * not an amount with at most two decimals or is out of range.
 */
export function parseMoney(text: string): bigint | null {
  const match = MONEY_TEXT.exec(text.trim());
  if (!match) return null;
  const [, minus, whole, fraction = ""] = match;
  const cents = BigInt(whole!.replace(/[ , ]/g, "")) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (cents > MONEY_MAX_CENTS) return null;
  return minus ? -cents : cents;
}

/** A DECIMAL(19,2) the driver returned as a number. */
export function centsFromDb(value: number | string): bigint {
  return BigInt(Math.round(Number(value) * 100));
}

/** Cents as a plain decimal ("-1234.50"): proc parameters and CSV. */
export function centsToDecimal(cents: bigint): string {
  const sign = cents < 0n ? "-" : "";
  const abs = cents < 0n ? -cents : cents;
  return `${sign}${abs / 100n}.${(abs % 100n).toString().padStart(2, "0")}`;
}

/**
 * Cents for display: "$1,234.56", negatives in parentheses as finance reads
 * them. `currency` is the code the sheet carries (ADR-0051), "" or absent for
 * no symbol.
 *
 * The number is still assembled from the bigint here — Intl supplies the symbol
 * and never the figure, so no amount passes through a float (ADR-0029). Every
 * call site inside the module must pass a currency; `formatMoneyGuardrail`
 * fails the build when one forgets, because a forgotten symbol is invisible.
 */
export function formatMoney(cents: bigint, currency?: string): string {
  const abs = cents < 0n ? -cents : cents;
  const whole = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const text = `${currencySymbol(currency)}${whole}.${(abs % 100n).toString().padStart(2, "0")}`;
  return cents < 0n ? `(${text})` : text;
}

/**
 * An amount as an input shows it ("-1,234.50", which parseMoney reads back);
 * other text as it is. Deliberately bare: a symbol in the field would not parse
 * back, so this is one of the two places that format money without a currency.
 */
export function formatMoneyField(text: string): string {
  const cents = parseMoney(text);
  if (cents === null) return text;
  return cents < 0n ? `-${formatMoney(-cents, NO_CURRENCY)}` : formatMoney(cents, NO_CURRENCY);
}

const PERCENT_TEXT = /^(\d{1,3})(?:\.(\d{1,4}))?$/;

/** A typed percentage ("5.6879") to micros of the fraction (56879n); null when invalid or over 100. */
export function parsePercent(text: string): bigint | null {
  const match = PERCENT_TEXT.exec(text.trim().replace(/\s*%$/, ""));
  if (!match) return null;
  const micros = BigInt(match[1]!) * 10_000n + BigInt((match[2] ?? "").padEnd(4, "0"));
  return micros > RATE_MAX_MICROS ? null : micros;
}

const FRACTION_TEXT = /^([01])(?:\.(\d{1,6}))?$/;

/** A stored fraction ("0.056879") to micros; null when invalid or over 1. */
export function parseFraction(text: string): bigint | null {
  const match = FRACTION_TEXT.exec(text.trim());
  if (!match) return null;
  const micros = BigInt(match[1]!) * MICROS + BigInt((match[2] ?? "").padEnd(6, "0"));
  return micros > RATE_MAX_MICROS ? null : micros;
}

/** A DECIMAL(9,6) fraction the driver returned as a number (0.056879 -> 56879n). */
export function microsFromDb(value: number | string): bigint {
  return BigInt(Math.round(Number(value) * 1_000_000));
}

/** Micros as the DECIMAL(9,6) fraction a proc takes ("0.056879"). */
export function microsToFraction(micros: bigint): string {
  return `${micros / MICROS}.${(micros % MICROS).toString().padStart(6, "0")}`;
}

/** Micros as a percentage for display and inputs ("5.6879", "5", "0"). */
export function formatPercent(micros: bigint): string {
  const whole = micros / 10_000n;
  const fraction = (micros % 10_000n).toString().padStart(4, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : `${whole}`;
}
