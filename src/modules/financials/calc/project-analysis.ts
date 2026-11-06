import {
  addWorkingDays,
  duration,
  isWeekend,
  parseDate,
  toNumber,
  type NumericInput,
} from "./project-math";

/**
 * Inverse of the standard normal CDF (Acklam's rational approximation,
 * |relative error| < 1.15e-9). Used to turn a confidence level into a z-score.
 */
export function normalQuantile(p: number): number {
  if (!(p > 0 && p < 1)) throw new Error("Probability must be between 0 and 1");

  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2,
    -3.066479806614716e1, 2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1,
    -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734,
    4.374664141464968, 2.938163982698783,
  ];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const low = 0.02425;
  const high = 1 - low;

  if (p < low) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }

  if (p <= high) {
    const q = p - 0.5;
    const r = q * q;
    return (
      ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
    );
  }

  const q = Math.sqrt(-2 * Math.log(1 - p));
  return -(
    (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  );
}

/** Standard normal CDF via Abramowitz & Stegun 7.1.26 (|error| < 1.5e-7). */
export function normalCdf(z: number): number {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const erf =
    sign *
    (1 -
      ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
        t *
        Math.exp(-x * x));
  return 0.5 * (1 + erf);
}

export interface ConfidenceResult {
  /** Best case at each confidence level (duration or cost, in the input unit). */
  p10: number;
  p50: number;
  p80: number;
  p90: number;
  p95: number;
  /** Chance of finishing at or below the target, as a percentage. */
  probability: number | null;
}

/**
 * PERT three-point estimates are usually treated as normal around the weighted
 * mean, so the confidence bounds are `expected + z × σ`.
 */
export function estimateConfidence({
  expected,
  sd,
  target,
}: {
  expected: NumericInput;
  sd: NumericInput;
  target?: NumericInput;
}): ConfidenceResult | null {
  const mean = toNumber(expected);
  const sigma = toNumber(sd);
  if (mean === null || sigma === null || sigma < 0) return null;

  const at = (level: number) => mean + normalQuantile(level) * sigma;
  const wanted = toNumber(target);

  return {
    p10: at(0.1),
    p50: at(0.5),
    p80: at(0.8),
    p90: at(0.9),
    p95: at(0.95),
    probability:
      wanted === null
        ? null
        : sigma === 0
          ? wanted >= mean
            ? 100
            : 0
          : normalCdf((wanted - mean) / sigma) * 100,
  };
}

export interface RiskRow {
  id: number;
  label: string;
  /** Probability in percent (30 = 30%). */
  probability: string;
  /** Signed cost impact: negative for a threat, positive for an opportunity. */
  impact: string;
}

export interface RiskSummary {
  emvById: Record<number, number | null>;
  /** Sum of the negative EMVs (a negative number). */
  threats: number;
  /** Sum of the positive EMVs (a positive number). */
  opportunities: number;
  /** threats + opportunities. */
  net: number;
  /** Contingency reserve to hold, i.e. the absolute threat exposure. */
  contingency: number;
  counted: number;
}

/** Expected monetary value: probability × impact, summed across the register. */
export function riskExposure(rows: RiskRow[]): RiskSummary {
  const emvById: Record<number, number | null> = {};
  let threats = 0;
  let opportunities = 0;
  let counted = 0;

  for (const row of rows) {
    const probability = toNumber(row.probability);
    const impact = toNumber(row.impact);
    if (probability === null || impact === null || probability < 0 || probability > 100) {
      emvById[row.id] = null;
      continue;
    }
    const emv = (probability / 100) * impact;
    emvById[row.id] = emv;
    counted += 1;
    if (emv < 0) threats += emv;
    else opportunities += emv;
  }

  return {
    emvById,
    threats,
    opportunities,
    net: threats + opportunities,
    contingency: Math.abs(threats),
    counted,
  };
}

export interface ForecastInput {
  /** Story points (or any unit of scope) delivered per sprint. */
  velocity: NumericInput;
  /** Remaining scope. */
  backlog: NumericInput;
  /** Sprint length in working weeks (2 = a fortnight). */
  sprintWeeks: NumericInput;
  start: string;
  target?: string;
}

export interface ForecastResult {
  sprints: number | null;
  weeks: number | null;
  /** Scope delivered per working week at the current velocity. */
  velocityPerWeek: number | null;
  finishMs: number | null;
  /** Velocity needed per sprint to hit the target date. */
  requiredVelocity: number | null;
  /** Working weeks available before the target date. */
  weeksAvailable: number | null;
}

/** Velocity-based delivery forecast on a working-day calendar. */
export function deliveryForecast({
  velocity,
  backlog,
  sprintWeeks,
  start,
  target,
}: ForecastInput): ForecastResult {
  const v = toNumber(velocity);
  const b = toNumber(backlog);
  const len = toNumber(sprintWeeks);

  const empty: ForecastResult = {
    sprints: null,
    weeks: null,
    velocityPerWeek: null,
    finishMs: null,
    requiredVelocity: null,
    weeksAvailable: null,
  };
  if (v === null || b === null || len === null || v <= 0 || len <= 0 || b < 0) return empty;

  const sprints = Math.ceil(b / v);
  const weeks = sprints * len;
  const workingDays = weeks * 5;
  // The span is inclusive of the start only when work can begin on it: a weekday
  // start is the first working day, a weekend start pushes day one to Monday.
  const startMs = parseDate(start);
  const inclusive = startMs !== null && !isWeekend(startMs) ? workingDays - 1 : workingDays;
  const finish = workingDays > 0 ? addWorkingDays({ start, days: inclusive }) : { dateMs: null };

  let weeksAvailable: number | null = null;
  let requiredVelocity: number | null = null;
  if (target) {
    const span = duration({ start, end: target });
    if (span.workingDays !== null && span.workingDays > 0) {
      weeksAvailable = span.workingDays / 5;
      requiredVelocity = b / (weeksAvailable / len);
    }
  }

  return {
    sprints,
    weeks,
    velocityPerWeek: v / len,
    finishMs: finish.dateMs,
    requiredVelocity,
    weeksAvailable,
  };
}

export interface BusinessCaseInput {
  initial: NumericInput;
  /** Discount rate in percent per year. */
  rate: NumericInput;
  /** Net cash flow per year, starting in year 1. */
  flows: NumericInput[];
}

export interface BusinessCaseResult {
  npv: number | null;
  /** Internal rate of return in percent, or null when there is no sign change. */
  irr: number | null;
  /** Years until the undiscounted flows repay the initial outlay. */
  paybackYears: number | null;
  discounted: number[];
  totalReturn: number | null;
}

const npvOf = (initial: number, flows: number[], rate: number): number =>
  flows.reduce((total, flow, index) => total + flow / (1 + rate) ** (index + 1), -initial);

export function businessCase({ initial, rate, flows }: BusinessCaseInput): BusinessCaseResult {
  const outlay = toNumber(initial);
  const annualRate = toNumber(rate);
  const numbers = flows.map((flow) => toNumber(flow));

  if (outlay === null || annualRate === null || numbers.some((flow) => flow === null)) {
    return { npv: null, irr: null, paybackYears: null, discounted: [], totalReturn: null };
  }

  const cash = numbers as number[];
  const npv = npvOf(outlay, cash, annualRate / 100);
  const discounted = cash.map((flow, index) => flow / (1 + annualRate / 100) ** (index + 1));

  // IRR by bisection over a wide, sane bracket.
  let irr: number | null = null;
  let low = -0.9999;
  let high = 10;
  let lowValue = npvOf(outlay, cash, low);
  const highValue = npvOf(outlay, cash, high);
  if (Number.isFinite(lowValue) && Number.isFinite(highValue) && lowValue * highValue <= 0) {
    for (let i = 0; i < 200; i += 1) {
      const mid = (low + high) / 2;
      const midValue = npvOf(outlay, cash, mid);
      if (lowValue * midValue <= 0) {
        high = mid;
      } else {
        low = mid;
        lowValue = midValue;
      }
    }
    irr = ((low + high) / 2) * 100;
  }

  // Simple payback on undiscounted flows.
  let cumulative = 0;
  let paybackYears: number | null = null;
  for (let year = 0; year < cash.length; year += 1) {
    const before = cumulative;
    cumulative += cash[year];
    if (before < outlay && cumulative >= outlay) {
      const shortfall = outlay - before;
      paybackYears = year + shortfall / cash[year];
      break;
    }
  }

  return {
    npv,
    irr,
    paybackYears,
    discounted,
    totalReturn: cash.reduce((total, flow) => total + flow, 0) - outlay,
  };
}

export interface CostBuildUpInput {
  hours: NumericInput;
  rate: NumericInput;
  people: NumericInput;
  overheadPct: NumericInput;
  contingencyPct: NumericInput;
  units: NumericInput;
}

export interface CostBuildUpResult {
  labour: number | null;
  overhead: number | null;
  subtotal: number | null;
  contingency: number | null;
  total: number | null;
  perUnit: number | null;
}

/** Bottom-up labour cost with overhead and contingency on top. */
export function costBuildUp({
  hours,
  rate,
  people,
  overheadPct,
  contingencyPct,
  units,
}: CostBuildUpInput): CostBuildUpResult {
  const h = toNumber(hours);
  const r = toNumber(rate);
  const p = toNumber(people) ?? 1;
  const overhead = toNumber(overheadPct) ?? 0;
  const contingency = toNumber(contingencyPct) ?? 0;
  const unitCount = toNumber(units);

  if (h === null || r === null) {
    return {
      labour: null,
      overhead: null,
      subtotal: null,
      contingency: null,
      total: null,
      perUnit: null,
    };
  }

  const labour = h * r * p;
  const overheadCost = (labour * overhead) / 100;
  const subtotal = labour + overheadCost;
  const contingencyCost = (subtotal * contingency) / 100;
  const total = subtotal + contingencyCost;

  return {
    labour,
    overhead: overheadCost,
    subtotal,
    contingency: contingencyCost,
    total,
    perUnit: unitCount !== null && unitCount > 0 ? total / unitCount : null,
  };
}

export interface CashPeriod {
  id: number;
  /** Cash received in the period. */
  inflow: string;
  /** Cash spent in the period. */
  outflow: string;
}

export interface CashFlowRow {
  id: number;
  /** inflow − outflow for the period. */
  net: number;
  /** Running balance from the outlay, i.e. −initial + Σ net. */
  cumulative: number;
}

export interface CashFlowResult {
  rows: CashFlowRow[];
  inflowTotal: number;
  outflowTotal: number;
  /** Σ (inflow − outflow), before the initial outlay. */
  netTotal: number;
  /** (netTotal − initial) ÷ initial × 100 — cash-on-cash return. */
  roi: number | null;
  /** Balance after the last period: netTotal − initial. */
  finalPosition: number | null;
  /** Most negative balance — the cash the project needs funded up front. */
  peakFunding: number | null;
  /** 1-based period in which the balance first turns positive. */
  breakevenPeriod: number | null;
  /** Periods that ended with a positive balance. */
  positivePeriods: number;
}

/**
 * Period cash flow: returns net cash, the cumulative balance curve, cash-on-cash
 * ROI, the peak funding requirement and the breakeven period.
 */
export function cashFlowRoi({
  initial,
  rows,
}: {
  initial: NumericInput;
  rows: CashPeriod[];
}): CashFlowResult {
  const outlay = toNumber(initial);
  let running = outlay === null ? 0 : -outlay;
  let peak = running;
  let breakevenPeriod: number | null = null;
  let inflowTotal = 0;
  let outflowTotal = 0;
  let positivePeriods = 0;

  const result: CashFlowRow[] = rows.map((row, index) => {
    const inflow = toNumber(row.inflow) ?? 0;
    const outflow = toNumber(row.outflow) ?? 0;
    const net = inflow - outflow;
    running += net;
    inflowTotal += inflow;
    outflowTotal += outflow;
    if (running < peak) peak = running;
    if (running >= 0 && breakevenPeriod === null) breakevenPeriod = index + 1;
    if (running > 0) positivePeriods += 1;
    return { id: row.id, net, cumulative: running };
  });

  const netTotal = result.reduce((total, row) => total + row.net, 0);

  return {
    rows: result,
    inflowTotal,
    outflowTotal,
    netTotal,
    roi: outlay !== null && outlay > 0 ? ((netTotal - outlay) / outlay) * 100 : null,
    finalPosition: outlay === null ? null : netTotal - outlay,
    peakFunding: outlay === null ? null : peak,
    breakevenPeriod,
    positivePeriods,
  };
}

export interface ResourceResult {
  /** Demand values that were parsed from the input, in order. */
  demand: number[];
  periods: number;
  total: number;
  average: number;
  peak: number;
  /** 1-based period holding the peak. */
  peakPeriod: number | null;
  /** Capacity per period, when one was supplied. */
  capacity: number | null;
  /** average ÷ capacity × 100. */
  utilisation: number | null;
  /** 1-based periods that exceed capacity. */
  overloaded: number[];
  /** peak − capacity, floored at 0. */
  worstOverload: number;
  /** Levelled (capped) demand per period, including any spill into extra periods. */
  levelled: number[];
  /** Periods the plan needs once capped at capacity. */
  levelledPeriods: number | null;
  /** Levelling delays the finish by this many periods. */
  extraPeriods: number | null;
  /** The lowest flat capacity that would finish inside the current span. */
  capacityForSameSpan: number | null;
}

/** Parse a loose list such as "6, 9, 4, 11" or "6 9 4 11" into numbers. */
export function parseSeries(input: string): number[] {
  return input
    .split(/[^0-9.+-]+/)
    .map((part) => part.trim())
    .filter((part) => part !== "" && !Number.isNaN(Number(part)))
    .map(Number);
}

/**
 * Resource levelling for a single resource over equal periods.
 *
 * Demand above capacity cannot be worked, so it spills forward into the next
 * period (serial/greedy levelling) — which is exactly why the finish date moves.
 * Everything is expressed in periods, so the same maths works for days, weeks
 * or sprints.
 */
export function resourceLevel({
  demand,
  capacity,
}: {
  demand: string;
  capacity: NumericInput;
}): ResourceResult {
  const series = parseSeries(demand);
  const total = series.reduce((sum, value) => sum + value, 0);
  const periods = series.length;
  const average = periods > 0 ? total / periods : 0;
  const peak = series.length > 0 ? Math.max(...series) : 0;
  const peakPeriod = series.length > 0 ? series.indexOf(peak) + 1 : null;
  const cap = toNumber(capacity);

  if (cap === null || cap <= 0 || periods === 0) {
    return {
      demand: series,
      periods,
      total,
      average,
      peak,
      peakPeriod,
      capacity: cap,
      utilisation: null,
      overloaded: [],
      worstOverload: 0,
      levelled: [],
      levelledPeriods: null,
      extraPeriods: null,
      capacityForSameSpan: periods > 0 ? Math.ceil(total / periods) : null,
    };
  }

  const overloaded: number[] = [];
  series.forEach((value, index) => {
    if (value > cap) overloaded.push(index + 1);
  });

  const levelled: number[] = [];
  let carry = 0;
  for (const value of series) {
    const work = value + carry;
    const worked = Math.min(cap, work);
    levelled.push(worked);
    carry = work - worked;
  }
  while (carry > 1e-9) {
    const worked = Math.min(cap, carry);
    levelled.push(worked);
    carry -= worked;
  }

  return {
    demand: series,
    periods,
    total,
    average,
    peak,
    peakPeriod,
    capacity: cap,
    utilisation: (average / cap) * 100,
    overloaded,
    worstOverload: Math.max(0, peak - cap),
    levelled,
    levelledPeriods: levelled.length,
    extraPeriods: levelled.length - periods,
    capacityForSameSpan: Math.ceil(total / periods),
  };
}
