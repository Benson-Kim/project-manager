import type { CsvCell } from "@/lib/csv";
import { messages } from "@/lib/messages";
import type { SheetDto } from "../schemas/financial";
import { SECTIONS } from "./engine";
import { fiscalYearLabel } from "./fiscal";
import { centsToDecimal, formatPercent, parseFraction } from "./money";
import { calculateSheet } from "./sheet";

/**
 * The financial as spreadsheet rows (ADR-0029): the workbook's Budget
 * Execution layout (each year's "Cost before tax" and "Tax included") with
 * section totals, then the monitoring per line (budget, spent, balance before
 * tax, status) and every transaction. Figures come from the shared engine.
 */

const M = messages.financials;
const num = (cents: bigint): CsvCell => ({ number: centsToDecimal(cents) });

export function financialCsvRows(sheet: SheetDto): CsvCell[][] {
  const f = sheet.financial;
  const { plan, monitor } = calculateSheet(sheet);
  const label = (year: number) => fiscalYearLabel(year, f.startMonth);
  const profile = (id: number | null) => sheet.profiles.find((p) => p.id === id)?.name ?? M.noTax;
  const lineName = new Map(sheet.lines.map((l) => [l.id, l.description]));

  const rows: CsvCell[][] = [
    [M.titleLabel, f.title],
    [M.projectNumber, f.projectNumber === null ? null : { number: String(f.projectNumber) }],
    [M.budgetEnvelope, f.budgetEnvelope],
    [M.glGrandLivre, f.glGrandLivre],
    [
      `${M.budget} (${(f.budgetIncludesTax ? M.withTax : M.beforeTax).toLowerCase()})`,
      f.budget === null ? null : { number: f.budget },
    ],
    [],
    [
      M.description,
      M.section,
      M.costCategory,
      M.fundingSource,
      M.supplier,
      M.glAccount,
      M.taxProfile,
      M.recurrent,
      ...plan.years.flatMap((y) => [`${label(y)} ${M.beforeTax}`, `${label(y)} ${M.withTax}`]),
      M.grandTotalBeforeTax,
      M.grandTotalWithTax,
      M.comments,
    ],
  ];

  for (const section of SECTIONS) {
    for (const line of sheet.lines.filter((l) => l.section === section)) {
      const p = plan.lines.get(line.id)!;
      rows.push([
        line.description,
        M.sections[section],
        line.costCategory,
        line.fundingSource,
        line.supplier,
        line.glAccount,
        profile(line.taxProfileId),
        line.isRecurrent ? M.recurrent : null,
        ...p.cells.flatMap((c) => [num(c.beforeTax), num(c.withTax)]),
        num(p.beforeTax),
        num(p.withTax),
        line.comments,
      ]);
    }
    const t = plan.sections[section];
    rows.push([
      M.sectionTotal(M.sections[section]),
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      ...t.byYear.flatMap((y) => [num(y.beforeTax), num(y.withTax)]),
      num(t.beforeTax),
      num(t.withTax),
    ]);
  }
  rows.push([
    M.total,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    ...plan.total.byYear.flatMap((y) => [num(y.beforeTax), num(y.withTax)]),
    num(plan.total.beforeTax),
    num(plan.total.withTax),
  ]);

  const pre = (name: string) => `${name} (${M.beforeTax.toLowerCase()})`;
  const incl = (name: string) => `${name} (${M.withTax.toLowerCase()})`;
  rows.push(
    [],
    [M.monitoringTab],
    [
      M.description,
      pre(M.budgetLabel),
      pre(M.spent),
      pre(M.balance),
      incl(M.budgetLabel),
      incl(M.balance),
      M.statusLabel,
    ],
  );
  for (const line of sheet.lines) {
    const t = monitor.lines.get(line.id)!.total;
    rows.push([
      line.description,
      num(t.budgetBeforeTax),
      num(t.spentBeforeTax),
      num(t.balanceBeforeTax),
      num(t.budget),
      num(t.balance),
      M.status[t.status],
    ]);
  }

  rows.push(
    [],
    [M.transactions],
    [M.date, M.fiscalYear, M.line, M.reference, M.description, M.amountBeforeTax, M.rate],
  );
  for (const t of sheet.transactions) {
    rows.push([
      t.date,
      label(t.fiscalYear),
      lineName.get(t.lineId) ?? null,
      t.reference,
      t.description,
      { number: t.amount },
      { number: formatPercent(parseFraction(t.taxRate) ?? 0n) },
    ]);
  }
  return rows;
}
