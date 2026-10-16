/**
 * CSV for spreadsheet users (FI2 / ADR-0029; Reports reuse it): UTF-8 with a
 * BOM so Excel reads accents, CRLF rows, RFC 4180 quoting. Text that a
 * spreadsheet would run as a formula (starting with = + - @ tab or CR) is
 * prefixed with an apostrophe. Numbers are passed as { number: "1234.50" } and
 * written as-is, so a negative amount stays a number; anything that is not a
 * plain decimal is treated as text.
 */

export type CsvCell = string | number | null | undefined | { number: string };

/** Byte order mark: Excel reads the file as UTF-8. */
const BOM = String.fromCharCode(0xfeff);

const FORMULA_START = /^[=+\-@\t\r]/;
const DECIMAL = /^-?\d+(\.\d+)?$/;

function text(value: string): string {
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function csvCell(cell: CsvCell): string {
  if (cell === null || cell === undefined) return "";
  if (typeof cell === "number") return Number.isFinite(cell) ? String(cell) : "";
  if (typeof cell === "object") return DECIMAL.test(cell.number) ? cell.number : text(cell.number);
  return text(cell);
}

export function toCsv(rows: readonly (readonly CsvCell[])[]): string {
  return `${BOM}${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
