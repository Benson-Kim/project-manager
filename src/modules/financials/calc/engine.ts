import { horizonYears, inHorizon } from "./fiscal";
import { applyRate, shareOf } from "./money";

/**
 * The financials calculator (ADR-0029): one pure, isomorphic model the planner
 * runs live in the browser and the server runs for exports. No user formulas.
 *
 * - Budget: a line's tax-included amount for a year is its pre-tax amount with
 *   the rate its tax profile applies in that year (the latest rate step from
 *   that year or before, else the profile's rate) rounded to the cent (the
 *   source workbook's H11), and totals are sums of those rounded cells.
 * - Recurrent lines: a year without a typed amount, after the line's first typed
 *   year, is the previous year escalated by the financial's escalation rate.
 *   Typed years always win; a typed 0 stops the chain.
 * - Monitoring: each transaction costs its pre-tax amount with the tax rate
 *   captured on the transaction. The status compares pre-tax figures, as the
 *   workbook's monitoring did: rounding each invoice's tax separately can put a
 *   fully spent line a cent over its rounded tax-included budget.
 */

export const SECTIONS = ["operating", "capital", "other"] as const;
export type Section = (typeof SECTIONS)[number];

export interface CalcSettings {
  firstFiscalYear: number;
  horizonYears: number;
  escalationMicros: bigint;
  flagThresholdMicros: bigint;
}

export interface CalcTaxProfile {
  id: number;
  rateMicros: bigint;
  /** Rate changes from a fiscal year on, in any order. */
  steps?: readonly { fromFiscalYear: number; rateMicros: bigint }[];
}

export interface CalcLine {
  id: number;
  section: Section;
  taxProfileId: number | null;
  isRecurrent: boolean;
  /** Typed pre-tax amounts by fiscal year. */
  amounts: ReadonlyMap<number, bigint>;
}

export interface CalcTransaction {
  id: number;
  lineId: number;
  fiscalYear: number;
  amountCents: bigint;
  taxRateMicros: bigint;
}

export type AmountSource = "typed" | "escalated" | "none";

export interface PlanCell {
  fiscalYear: number;
  beforeTax: bigint;
  withTax: bigint;
  source: AmountSource;
}

export interface Totals {
  byYear: { fiscalYear: number; beforeTax: bigint; withTax: bigint }[];
  beforeTax: bigint;
  withTax: bigint;
}

export interface LinePlan {
  lineId: number;
  cells: PlanCell[];
  beforeTax: bigint;
  withTax: bigint;
}

export interface Plan {
  years: number[];
  lines: Map<number, LinePlan>;
  sections: Record<Section, Totals>;
  total: Totals;
}

function emptyTotals(years: number[]): Totals {
  return {
    byYear: years.map((fiscalYear) => ({ fiscalYear, beforeTax: 0n, withTax: 0n })),
    beforeTax: 0n,
    withTax: 0n,
  };
}

function addToTotals(totals: Totals, index: number, beforeTax: bigint, withTax: bigint): void {
  const year = totals.byYear[index]!;
  year.beforeTax += beforeTax;
  year.withTax += withTax;
  totals.beforeTax += beforeTax;
  totals.withTax += withTax;
}

/** The rate a profile applies in a fiscal year; no profile (or an unknown one) is no tax. */
export function rateOf(
  profiles: readonly CalcTaxProfile[],
  profileId: number | null,
  fiscalYear?: number,
): bigint {
  if (profileId === null) return 0n;
  const profile = profiles.find((p) => p.id === profileId);
  if (!profile) return 0n;
  if (fiscalYear === undefined || !profile.steps?.length) return profile.rateMicros;
  let rate = profile.rateMicros;
  let from = -Infinity;
  for (const step of profile.steps) {
    if (step.fromFiscalYear <= fiscalYear && step.fromFiscalYear > from) {
      rate = step.rateMicros;
      from = step.fromFiscalYear;
    }
  }
  return rate;
}

/** A line's pre-tax amount per horizon year, with where each came from. */
export function lineAmounts(
  line: CalcLine,
  years: readonly number[],
  escalationMicros: bigint,
): { fiscalYear: number; beforeTax: bigint; source: AmountSource }[] {
  let previous: bigint | null = null;
  return years.map((fiscalYear) => {
    const typed = line.amounts.get(fiscalYear);
    if (typed !== undefined) {
      previous = typed;
      return { fiscalYear, beforeTax: typed, source: "typed" as const };
    }
    if (line.isRecurrent && previous !== null) {
      previous = applyRate(previous, escalationMicros);
      return { fiscalYear, beforeTax: previous, source: "escalated" as const };
    }
    return { fiscalYear, beforeTax: 0n, source: "none" as const };
  });
}

export function buildPlan(
  settings: CalcSettings,
  profiles: readonly CalcTaxProfile[],
  lines: readonly CalcLine[],
): Plan {
  const years = horizonYears(settings.firstFiscalYear, settings.horizonYears);
  const sections = Object.fromEntries(SECTIONS.map((s) => [s, emptyTotals(years)])) as Record<
    Section,
    Totals
  >;
  const total = emptyTotals(years);
  const planned = new Map<number, LinePlan>();

  for (const line of lines) {
    const cells = lineAmounts(line, years, settings.escalationMicros).map((a) => ({
      ...a,
      withTax: applyRate(a.beforeTax, rateOf(profiles, line.taxProfileId, a.fiscalYear)),
    }));
    const plan: LinePlan = { lineId: line.id, cells, beforeTax: 0n, withTax: 0n };
    cells.forEach((cell, i) => {
      plan.beforeTax += cell.beforeTax;
      plan.withTax += cell.withTax;
      addToTotals(sections[line.section], i, cell.beforeTax, cell.withTax);
      addToTotals(total, i, cell.beforeTax, cell.withTax);
    });
    planned.set(line.id, plan);
  }

  return { years, lines: planned, sections, total };
}

/** Transaction cost: its pre-tax amount with the rate captured on it. */
export function transactionCost(t: CalcTransaction): bigint {
  return applyRate(t.amountCents, t.taxRateMicros);
}

export type MonitorStatus = "idle" | "ok" | "low" | "over" | "unbudgeted";

export interface MonitorFigures {
  budgetBeforeTax: bigint;
  budget: bigint;
  spentBeforeTax: bigint;
  spent: bigint;
  balanceBeforeTax: bigint;
  balance: bigint;
  status: MonitorStatus;
}

export interface MonitorCell extends MonitorFigures {
  fiscalYear: number;
}

export interface LineMonitor {
  lineId: number;
  cells: MonitorCell[];
  total: MonitorFigures;
}

export interface Monitor {
  years: number[];
  lines: Map<number, LineMonitor>;
  sections: Record<Section, { cells: MonitorCell[]; total: MonitorFigures }>;
  total: { cells: MonitorCell[]; total: MonitorFigures };
  /** Transactions dated outside the horizon or on a line not in the sheet: listed, not counted. */
  uncounted: number[];
}

/**
 * idle: nothing budgeted or spent. unbudgeted: spending with no budget.
 * over: balance below zero. low: balance at or under the threshold share of
 * the budget (the workbook's "flag a problem" at 10 %). ok otherwise.
 */
export function statusOf(budget: bigint, spent: bigint, thresholdMicros: bigint): MonitorStatus {
  if (budget === 0n) return spent === 0n ? "idle" : "unbudgeted";
  const balance = budget - spent;
  if (balance < 0n) return "over";
  if (budget > 0n && balance <= shareOf(budget, thresholdMicros)) return "low";
  return "ok";
}

interface Sums {
  budgetBeforeTax: bigint;
  budget: bigint;
  spentBeforeTax: bigint;
  spent: bigint;
}

const zeroSums = (): Sums => ({ budgetBeforeTax: 0n, budget: 0n, spentBeforeTax: 0n, spent: 0n });

function figures(s: Sums, thresholdMicros: bigint): MonitorFigures {
  return {
    ...s,
    balanceBeforeTax: s.budgetBeforeTax - s.spentBeforeTax,
    balance: s.budget - s.spent,
    status: statusOf(s.budgetBeforeTax, s.spentBeforeTax, thresholdMicros),
  };
}

function add(into: Sums, from: Sums): void {
  into.budgetBeforeTax += from.budgetBeforeTax;
  into.budget += from.budget;
  into.spentBeforeTax += from.spentBeforeTax;
  into.spent += from.spent;
}

function rollUp(rows: Sums[][], years: number[], thresholdMicros: bigint) {
  const perYear = years.map(() => zeroSums());
  const all = zeroSums();
  for (const row of rows) {
    row.forEach((s, i) => {
      add(perYear[i]!, s);
      add(all, s);
    });
  }
  return {
    cells: perYear.map((s, i) => ({ fiscalYear: years[i]!, ...figures(s, thresholdMicros) })),
    total: figures(all, thresholdMicros),
  };
}

export function buildMonitor(
  settings: CalcSettings,
  plan: Plan,
  lines: readonly CalcLine[],
  transactions: readonly CalcTransaction[],
): Monitor {
  const { years } = plan;
  const threshold = settings.flagThresholdMicros;
  const sums = new Map<number, Sums[]>();
  for (const line of lines) {
    const linePlan = plan.lines.get(line.id);
    sums.set(
      line.id,
      years.map((_, i) => ({
        ...zeroSums(),
        budgetBeforeTax: linePlan?.cells[i]?.beforeTax ?? 0n,
        budget: linePlan?.cells[i]?.withTax ?? 0n,
      })),
    );
  }

  const uncounted: number[] = [];
  for (const t of transactions) {
    const row = sums.get(t.lineId);
    if (!row || !inHorizon(t.fiscalYear, settings.firstFiscalYear, settings.horizonYears)) {
      uncounted.push(t.id);
      continue;
    }
    const cell = row[t.fiscalYear - settings.firstFiscalYear]!;
    cell.spentBeforeTax += t.amountCents;
    cell.spent += transactionCost(t);
  }

  const monitored = new Map<number, LineMonitor>();
  for (const line of lines) {
    const row = sums.get(line.id)!;
    const all = zeroSums();
    row.forEach((s) => add(all, s));
    monitored.set(line.id, {
      lineId: line.id,
      cells: row.map((s, i) => ({ fiscalYear: years[i]!, ...figures(s, threshold) })),
      total: figures(all, threshold),
    });
  }

  const sections = Object.fromEntries(
    SECTIONS.map((section) => [
      section,
      rollUp(
        lines.filter((l) => l.section === section).map((l) => sums.get(l.id)!),
        years,
        threshold,
      ),
    ]),
  ) as Monitor["sections"];

  return {
    years,
    lines: monitored,
    sections,
    total: rollUp(
      lines.map((l) => sums.get(l.id)!),
      years,
      threshold,
    ),
    uncounted,
  };
}
