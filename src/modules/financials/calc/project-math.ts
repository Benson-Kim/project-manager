const DAY = 86_400_000;

/** Accepts numbers or user-typed strings ("1,250", "$4,000", ""). */
export type NumericInput = string | number | null | undefined;

/** Parse a user-typed number ("1,250", "$4,000", ""). Returns null when unusable. */
export const toNumber = (value: NumericInput): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed =
    typeof value === "number" ? value : Number.parseFloat(String(value).replace(/[,\s$€£%]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
};

const safeDiv = (a: number | null, b: number | null): number | null =>
  b === null || b === 0 || a === null ? null : a / b;

export interface EarnedValueInput {
  bac: NumericInput;
  pv: NumericInput;
  ev: NumericInput;
  ac: NumericInput;
}

export interface EarnedValueResult {
  bac: number | null;
  pv: number | null;
  ev: number | null;
  ac: number | null;
  /** Cost variance (EV − AC): positive is under budget. */
  cv: number | null;
  /** Schedule variance (EV − PV): positive is ahead of schedule. */
  sv: number | null;
  /** Cost performance index (EV ÷ AC). */
  cpi: number | null;
  /** Schedule performance index (EV ÷ PV). */
  spi: number | null;
  /** Estimate at completion (BAC ÷ CPI). */
  eac: number | null;
  /** Estimate to complete (EAC − AC). */
  etc: number | null;
  /** Variance at completion (BAC − EAC). */
  vac: number | null;
  /** To-complete performance index. */
  tcpi: number | null;
  /** Fraction of BAC earned (0–1). */
  pctComplete: number | null;
}

export function earnedValue({ bac, pv, ev, ac }: EarnedValueInput): EarnedValueResult {
  const B = toNumber(bac);
  const P = toNumber(pv);
  const E = toNumber(ev);
  const A = toNumber(ac);

  const cv = E !== null && A !== null ? E - A : null;
  const sv = E !== null && P !== null ? E - P : null;
  const cpi = safeDiv(E, A);
  const spi = safeDiv(E, P);
  const eac = cpi === null ? null : safeDiv(B, cpi);
  const etc = eac !== null && A !== null ? eac - A : null;
  const vac = eac !== null && B !== null ? B - eac : null;
  const tcpi = B !== null && E !== null && A !== null && B - A !== 0 ? (B - E) / (B - A) : null;

  return {
    bac: B,
    pv: P,
    ev: E,
    ac: A,
    cv,
    sv,
    cpi,
    spi,
    eac,
    etc,
    vac,
    tcpi,
    pctComplete: safeDiv(E, B),
  };
}

export interface PertInput {
  optimistic: NumericInput;
  mostLikely: NumericInput;
  pessimistic: NumericInput;
}

export interface PertResult {
  expected: number | null;
  sd: number | null;
  variance: number | null;
  low68: number | null;
  high68: number | null;
  low95: number | null;
  high95: number | null;
  /** Pessimistic < optimistic — likely a data-entry mistake. */
  inverted: boolean;
  /** Standard deviation above half the expected value — wide spread. */
  wide: boolean;
}

export function pert({ optimistic, mostLikely, pessimistic }: PertInput): PertResult {
  const o = toNumber(optimistic);
  const m = toNumber(mostLikely);
  const p = toNumber(pessimistic);

  if (o === null || m === null || p === null) {
    return {
      expected: null,
      sd: null,
      variance: null,
      low68: null,
      high68: null,
      low95: null,
      high95: null,
      inverted: false,
      wide: false,
    };
  }

  const expected = (o + 4 * m + p) / 6;
  const sd = (p - o) / 6;

  return {
    expected,
    sd,
    variance: sd * sd,
    low68: expected - sd,
    high68: expected + sd,
    low95: expected - 2 * sd,
    high95: expected + 2 * sd,
    inverted: p < o,
    wide: expected > 0 && sd > expected * 0.5,
  };
}

export interface PercentChangeResult {
  from: number | null;
  to: number | null;
  delta: number | null;
  pct: number | null;
  multiplier: number | null;
}

export function percentChange({
  from,
  to,
}: {
  from: NumericInput;
  to: NumericInput;
}): PercentChangeResult {
  const a = toNumber(from);
  const b = toNumber(to);
  if (a === null || b === null) return { from: a, to: b, delta: null, pct: null, multiplier: null };

  const delta = b - a;
  return {
    from: a,
    to: b,
    delta,
    pct: a === 0 ? null : (delta / a) * 100,
    multiplier: a === 0 ? null : b / a,
  };
}

/** "X% of Y" */
export function percentOf({ rate, amount }: { rate: NumericInput; amount: NumericInput }): {
  value: number | null;
} {
  const r = toNumber(rate);
  const a = toNumber(amount);
  if (r === null || a === null) return { value: null };
  return { value: (r / 100) * a };
}

export function shareOfTotal({ part, total }: { part: NumericInput; total: NumericInput }): {
  pct: number | null;
  remaining: number | null;
} {
  const p = toNumber(part);
  const t = toNumber(total);
  if (p === null || t === null || t === 0) return { pct: null, remaining: null };
  return { pct: (p / t) * 100, remaining: t - p };
}

/** `YYYY-MM-DD` to UTC epoch milliseconds; a date that does not exist, such as 2026-02-30, is null. */
export function parseDate(value: string | null | undefined): number | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  const ms = Date.UTC(year, month - 1, day);
  return Number.isFinite(ms) && toIsoDate(ms) === value ? ms : null;
}

export function toIsoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function weekdayName(ms: number): string {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(ms).getUTCDay()];
}

export const isWeekend = (ms: number): boolean => {
  const day = new Date(ms).getUTCDay();
  return day === 0 || day === 6;
};

export interface DurationInput {
  start: string;
  end: string;
  holidays?: NumericInput;
}

export interface DurationResult {
  /** Inclusive span in calendar days (null when dates are invalid). */
  calendarDays: number | null;
  /** Mon–Fri days inside the span, before holidays. */
  weekdays: number | null;
  holidayCount: number;
  workingDays: number | null;
  workWeeks: number;
  workRemainder: number;
  /** True when the end date precedes the start date. */
  reversed: boolean;
  startMs: number | null;
  endMs: number | null;
}

export function duration({ start, end, holidays = 0 }: DurationInput): DurationResult {
  const s = parseDate(start);
  const e = parseDate(end);
  const holidayCount = Math.max(0, Math.round(toNumber(holidays) ?? 0));

  const empty: DurationResult = {
    calendarDays: null,
    weekdays: null,
    holidayCount,
    workingDays: null,
    workWeeks: 0,
    workRemainder: 0,
    reversed: false,
    startMs: s,
    endMs: e,
  };
  if (s === null || e === null) return empty;

  const [from, to] = s <= e ? [s, e] : [e, s];
  const calendarDays = Math.round((to - from) / DAY) + 1;

  let weekdays = 0;
  for (let cursor = from; cursor <= to; cursor += DAY) {
    if (!isWeekend(cursor)) weekdays += 1;
  }

  const workingDays = Math.max(0, weekdays - holidayCount);

  return {
    calendarDays,
    weekdays,
    holidayCount,
    workingDays,
    workWeeks: Math.floor(workingDays / 5),
    workRemainder: workingDays % 5,
    reversed: s > e,
    startMs: from,
    endMs: to,
  };
}

export interface AddWorkingDaysInput {
  start: string;
  days: NumericInput;
  holidays?: NumericInput;
}

export interface AddWorkingDaysResult {
  dateMs: number | null;
  date: string | null;
  weekday: string | null;
}

/** Step forward/back through weekdays only, skipping the holiday count first. */
export function addWorkingDays({
  start,
  days,
  holidays = 0,
}: AddWorkingDaysInput): AddWorkingDaysResult {
  const s = parseDate(start);
  const n = toNumber(days);
  if (s === null || n === null) return { dateMs: null, date: null, weekday: null };

  const holidayCount = Math.max(0, Math.round(toNumber(holidays) ?? 0));
  const direction = n >= 0 ? 1 : -1;
  let remaining = Math.abs(Math.round(n));
  let holidaysLeft = holidayCount;
  let cursor = s;

  while (remaining > 0) {
    cursor += DAY * direction;
    if (isWeekend(cursor)) continue;
    if (holidaysLeft > 0) {
      holidaysLeft -= 1;
      continue;
    }
    remaining -= 1;
  }

  return { dateMs: cursor, date: toIsoDate(cursor), weekday: weekdayName(cursor) };
}
