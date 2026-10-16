import type { SheetDto } from "../schemas/financial";
import {
  buildMonitor,
  buildPlan,
  type CalcLine,
  type CalcSettings,
  type CalcTaxProfile,
  type CalcTransaction,
  type Monitor,
  type Plan,
} from "./engine";
import { parseFraction, parseMoney } from "./money";

/**
 * The sheet a page loads (SheetDto: exact decimal text) as the engine's
 * inputs (bigint cents and micros), and the plan and monitor built from it.
 * Pure, so the planner can recompute in the browser as people type.
 */

const cents = (text: string) => parseMoney(text) ?? 0n;
const micros = (text: string) => parseFraction(text) ?? 0n;

export function calcSettings(sheet: SheetDto): CalcSettings {
  const f = sheet.financial;
  return {
    firstFiscalYear: f.firstFiscalYear,
    horizonYears: f.horizonYears,
    escalationMicros: micros(f.escalationRate),
    flagThresholdMicros: micros(f.flagThresholdRate),
  };
}

export function calcProfiles(sheet: SheetDto): CalcTaxProfile[] {
  return sheet.profiles.map((p) => ({
    id: p.id,
    rateMicros: micros(p.rate),
    steps: p.steps.map((s) => ({ fromFiscalYear: s.fromFiscalYear, rateMicros: micros(s.rate) })),
  }));
}

export function calcLines(sheet: SheetDto): CalcLine[] {
  return sheet.lines.map((l) => ({
    id: l.id,
    section: l.section,
    taxProfileId: l.taxProfileId,
    isRecurrent: l.isRecurrent,
    amounts: new Map(
      Object.entries(l.amounts).map(([year, amount]) => [Number(year), cents(amount)]),
    ),
  }));
}

export function calcTransactions(sheet: SheetDto): CalcTransaction[] {
  return sheet.transactions.map((t) => ({
    id: t.id,
    lineId: t.lineId,
    fiscalYear: t.fiscalYear,
    amountCents: cents(t.amount),
    taxRateMicros: micros(t.taxRate),
  }));
}

export interface SheetResult {
  plan: Plan;
  monitor: Monitor;
}

export function calculateSheet(sheet: SheetDto): SheetResult {
  const settings = calcSettings(sheet);
  const lines = calcLines(sheet);
  const plan = buildPlan(settings, calcProfiles(sheet), lines);
  return { plan, monitor: buildMonitor(settings, plan, lines, calcTransactions(sheet)) };
}
