/**
 * Fiscal years (ADR-0029). A fiscal year is the calendar year it starts in:
 * with an April start (Quebec public bodies), 2023 is "2023-2024" and runs
 * 2023-04-01 to 2024-03-31. A January start is a plain calendar year.
 */

export const HORIZON_MIN = 1;
export const HORIZON_MAX = 7;
export const FISCAL_YEAR_MIN = 2000;
export const FISCAL_YEAR_MAX = 2100;
export const DEFAULT_START_MONTH = 4;

export function fiscalYearLabel(startYear: number, startMonth: number): string {
  return startMonth === 1 ? `${startYear}` : `${startYear}-${startYear + 1}`;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The fiscal year a calendar date ("YYYY-MM-DD", no time zone) falls in; null for other text. */
export function fiscalYearOf(isoDate: string, startMonth: number): number | null {
  const match = ISO_DATE.exec(isoDate);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  return month >= startMonth ? year : year - 1;
}

/** The fiscal years of a horizon, first to last. */
export function horizonYears(firstFiscalYear: number, horizon: number): number[] {
  return Array.from({ length: horizon }, (_, i) => firstFiscalYear + i);
}

export function inHorizon(fiscalYear: number, firstFiscalYear: number, horizon: number): boolean {
  return fiscalYear >= firstFiscalYear && fiscalYear < firstFiscalYear + horizon;
}
