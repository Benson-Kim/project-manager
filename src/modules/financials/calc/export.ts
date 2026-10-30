import type { CsvCell } from "@/lib/csv";
import { messages } from "@/lib/messages";
import { documentNameKey } from "../schemas/documents";
import type { SheetDto } from "../schemas/financial";
import { requiredLabel } from "./documents";
import { SECTIONS } from "./engine";
import { fiscalYearLabel } from "./fiscal";
import { centsToDecimal, formatPercent, parseFraction } from "./money";
import { calculateSheet } from "./sheet";

/**
 * The financial as spreadsheet rows (ADR-0029): the workbook's Budget
 * Execution layout (each year's "Cost before tax" and "Tax included") with
 * section totals, then the monitoring per line (budget, spent, balance before
 * tax, status), every transaction and the document checklist (ADR-0030).
 * Figures come from the shared engine. projectCsvRows writes one row per
 * financial of a project, with a column per document name.
 */

const M = messages.financials;
const num = (cents: bigint): CsvCell => ({ number: centsToDecimal(cents) });

export function financialCsvRows(sheet: SheetDto): CsvCell[][] {
  const f = sheet.financial;
  const { plan, monitor } = calculateSheet(sheet);
  const label = (year: number) => fiscalYearLabel(year, f.startMonth);
  // The currency names the money columns rather than their cells (ADR-0051): a cell stays the raw
  // decimal centsToDecimal writes, so the export opens as numbers in a spreadsheet, as it does now.
  const inCurrency = (header: string) => (f.currency ? `${header} (${f.currency})` : header);
  const profile = (id: number | null) => sheet.profiles.find((p) => p.id === id)?.name ?? M.noTax;
  const lineName = new Map(sheet.lines.map((l) => [l.id, l.description]));

  const rows: CsvCell[][] = [
    [M.titleLabel, f.title],
    [M.projectNumber, f.projectNumber === null ? null : { number: String(f.projectNumber) }],
    [M.budgetEnvelope, f.budgetEnvelope],
    [M.glGrandLivre, f.glGrandLivre],
    [
      inCurrency(`${M.budget} (${(f.budgetIncludesTax ? M.withTax : M.beforeTax).toLowerCase()})`),
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
      ...plan.years.flatMap((y) => [
        inCurrency(`${label(y)} ${M.beforeTax}`),
        inCurrency(`${label(y)} ${M.withTax}`),
      ]),
      inCurrency(M.grandTotalBeforeTax),
      inCurrency(M.grandTotalWithTax),
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

  const pre = (name: string) => inCurrency(`${name} (${M.beforeTax.toLowerCase()})`);
  const incl = (name: string) => inCurrency(`${name} (${M.withTax.toLowerCase()})`);
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
    [
      M.date,
      M.fiscalYear,
      M.line,
      M.reference,
      M.description,
      inCurrency(M.amountBeforeTax),
      M.rate,
    ],
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

  const D = M.documents;
  rows.push([], [D.heading], [D.name, D.required, D.reason, D.files]);
  for (const d of sheet.documents) {
    rows.push([
      d.name,
      requiredLabel(d.required),
      d.reason,
      (sheet.documentFiles[d.id] ?? []).map((file) => file.FileName).join("; ") || null,
    ]);
  }
  return rows;
}

/** One cell of a document column: its decision, and the reason when it is not required. */
function documentCell(required: boolean | null, reason: string | null): string {
  const label = requiredLabel(required);
  return required === false && reason ? `${label}: ${reason}` : label;
}

/**
 * Every financial of a project, one row each (ADR-0030): the breakdown, the
 * planned and spent totals, the checklist counts, then one column per document
 * name in the order they first appear. A financial that does not list a
 * document leaves its cell empty.
 *
 * Each financial carries its own currency (ADR-0051), so the money headers here
 * cannot name one: the currency is a column of its own instead.
 */
export function projectCsvRows(sheets: readonly SheetDto[]): CsvCell[][] {
  const D = M.documents;
  // Columns are keyed like the procs compare names (case-insensitive); the first spelling heads it.
  const columns = new Map<string, string>();
  for (const sheet of sheets)
    for (const d of sheet.documents)
      if (!columns.has(documentNameKey(d.name))) columns.set(documentNameKey(d.name), d.name);
  const names = [...columns.values()];

  const rows: CsvCell[][] = [
    [
      M.titleLabel,
      M.projectNumber,
      M.budgetEnvelope,
      M.glGrandLivre,
      M.budget,
      M.budgetIncludesTax,
      M.currency,
      M.firstFiscalYear,
      M.horizonYears,
      M.grandTotalBeforeTax,
      M.grandTotalWithTax,
      `${M.spent} (${M.beforeTax.toLowerCase()})`,
      M.recurrentFees,
      M.contractTimeframe,
      D.countRequired,
      D.countWithFile,
      D.countUndecided,
      ...names,
    ],
  ];
  for (const sheet of sheets) {
    const f = sheet.financial;
    const { plan, monitor } = calculateSheet(sheet);
    const byName = new Map(sheet.documents.map((d) => [documentNameKey(d.name), d]));
    const required = sheet.documents.filter((d) => d.required === true);
    rows.push([
      f.title,
      f.projectNumber === null ? null : { number: String(f.projectNumber) },
      f.budgetEnvelope,
      f.glGrandLivre,
      f.budget === null ? null : { number: f.budget },
      f.budgetIncludesTax ? M.withTax : M.beforeTax,
      f.currency || null,
      label(f.firstFiscalYear, f.startMonth),
      { number: String(f.horizonYears) },
      num(plan.total.beforeTax),
      num(plan.total.withTax),
      num(monitor.total.total.spentBeforeTax),
      f.recurrentFees === null ? null : { number: f.recurrentFees },
      f.contractTimeframe,
      { number: String(required.length) },
      { number: String(required.filter((d) => d.fileCount > 0).length) },
      { number: String(sheet.documents.filter((d) => d.required === null).length) },
      ...names.map((name) => {
        const d = byName.get(documentNameKey(name));
        return d ? documentCell(d.required, d.reason) : null;
      }),
    ]);
  }
  return rows;
}

const label = (year: number, startMonth: number) => fiscalYearLabel(year, startMonth);
