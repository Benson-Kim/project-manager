import { toIsoDate, weekdayName } from "./project-math";

const MINUS = "−";

export function formatNumber(
  value: number | null | undefined,
  { maxFractionDigits = 10 }: { maxFractionDigits?: number } = {},
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  if (!Number.isFinite(value)) return value > 0 ? "∞" : `${MINUS}∞`;
  if (value === 0) return "0";
  const magnitude = Math.abs(value);
  if (magnitude >= 1e15 || magnitude < 1e-9) {
    return value
      .toExponential(6)
      .replace(/\.?0+e/, "e")
      .replace("e+", "e");
  }
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: maxFractionDigits }).format(
    Number(value.toPrecision(12)),
  );
}

export function formatDecimal(value: number | null, digits = 2): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

/** The minus sign sits outside the symbol: −$45,455. */
export function formatCurrency(
  value: number | null,
  { digits = 0, symbol = "$" }: { digits?: number; symbol?: string } = {},
): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value < 0 ? MINUS : ""}${symbol}${formatDecimal(Math.abs(value), digits)}`;
}

export function formatSignedPercent(
  value: number | null,
  digits = 1,
  { signed = true }: { signed?: boolean } = {},
): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const plus = signed && value > 0 ? "+" : "";
  return `${value < 0 ? MINUS : plus}${formatDecimal(Math.abs(value), digits)}%`;
}

export function formatDay(ms: number | null): string {
  return ms === null ? "—" : `${weekdayName(ms)} ${toIsoDate(ms)}`;
}
