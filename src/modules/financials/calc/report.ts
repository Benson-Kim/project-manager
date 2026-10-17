import { messages } from "@/lib/messages";
import type { SheetDto } from "../schemas/financial";
import {
  documentSuggestion,
  documentSummary,
  requiredLabel,
  suggestionContext,
  type DocumentSummary,
} from "./documents";
import { SECTIONS } from "./engine";
import { fiscalYearLabel } from "./fiscal";
import { formatMoney, formatPercent, parseFraction, parseMoney } from "./money";
import { calculateSheet } from "./sheet";

/**
 * One financial as a printable report (ADR-0030): the breakdown, the budget
 * summary by section and year, the monitoring per line and the document
 * checklist, all as display text from the shared engine. The print view and
 * the PDF render this same model, so they never disagree.
 */

const M = messages.financials;

export interface ReportTable {
  heading: string;
  columns: string[];
  /** Columns holding amounts (right-aligned). */
  numeric: number[];
  rows: string[][];
  /** Rows to emphasise (totals), by index. */
  strong: number[];
}

export interface FinancialReport {
  title: string;
  period: string;
  fields: [string, string][];
  tables: ReportTable[];
  documents: {
    name: string;
    required: string;
    reason: string;
    files: string[];
    suggestion: string | null;
  }[];
  documentSummary: DocumentSummary;
}

const money = (cents: bigint) => formatMoney(cents);

export function financialReport(sheet: SheetDto): FinancialReport {
  const f = sheet.financial;
  const { plan, monitor } = calculateSheet(sheet);
  const label = (year: number) => fiscalYearLabel(year, f.startMonth);
  const authorised = f.budget === null ? null : parseMoney(f.budget);
  const planned = f.budgetIncludesTax ? plan.total.withTax : plan.total.beforeTax;
  const ctx = suggestionContext(sheet, plan);

  const fields: [string, string][] = [
    [M.projectNumber, f.projectNumber === null ? "" : String(f.projectNumber)],
    [M.budgetEnvelope, f.budgetEnvelope ?? ""],
    [M.glGrandLivre, f.glGrandLivre ?? ""],
    [M.acquisition, f.acquisition ?? ""],
    [
      `${M.budget} (${(f.budgetIncludesTax ? M.withTax : M.beforeTax).toLowerCase()})`,
      authorised === null ? "" : money(authorised),
    ],
    [M.plannedTotal, money(planned)],
    [M.recurrentFees, f.recurrentFees === null ? "" : money(parseMoney(f.recurrentFees) ?? 0n)],
    [M.contractTimeframe, f.contractTimeframe ?? ""],
    [M.spendBy, f.spendBy ?? ""],
    [M.escalationRate, formatPercent(parseFraction(f.escalationRate) ?? 0n)],
    [
      M.taxProfiles,
      sheet.profiles
        .map((p) => `${p.name} ${formatPercent(parseFraction(p.rate) ?? 0n)} %`)
        .join(", "),
    ],
  ].filter(([, value]) => value !== "") as [string, string][];

  const budgetRows: string[][] = [];
  const strong: number[] = [];
  for (const section of SECTIONS) {
    const t = plan.sections[section];
    budgetRows.push([
      M.sections[section],
      ...t.byYear.map((y) => money(y.beforeTax)),
      money(t.beforeTax),
      money(t.withTax),
    ]);
  }
  strong.push(budgetRows.length);
  budgetRows.push([
    M.total,
    ...plan.total.byYear.map((y) => money(y.beforeTax)),
    money(plan.total.beforeTax),
    money(plan.total.withTax),
  ]);
  const budgetColumns = [
    M.section,
    ...plan.years.map((y) => `${label(y)} (${M.beforeTax.toLowerCase()})`),
    M.grandTotalBeforeTax,
    M.grandTotalWithTax,
  ];

  const monitorRows = sheet.lines.map((line) => {
    const t = monitor.lines.get(line.id)!.total;
    return [
      line.description,
      money(t.budgetBeforeTax),
      money(t.spentBeforeTax),
      money(t.balanceBeforeTax),
      M.status[t.status],
    ];
  });

  return {
    title: f.title || messages.app.untitled,
    period: `${label(f.firstFiscalYear)} – ${label(f.firstFiscalYear + f.horizonYears - 1)}`,
    fields,
    tables: [
      {
        heading: M.budgetSummary,
        columns: budgetColumns,
        numeric: budgetColumns.map((_, i) => i).slice(1),
        rows: budgetRows,
        strong,
      },
      {
        heading: M.monitoringSummary,
        columns: [
          M.description,
          `${M.budgetLabel} (${M.beforeTax.toLowerCase()})`,
          `${M.spent} (${M.beforeTax.toLowerCase()})`,
          `${M.balance} (${M.beforeTax.toLowerCase()})`,
          M.statusLabel,
        ],
        numeric: [1, 2, 3],
        rows: monitorRows,
        strong: [],
      },
    ],
    documents: sheet.documents.map((d) => {
      const match = documentSuggestion(d, ctx);
      return {
        name: d.name,
        required: requiredLabel(d.required),
        reason: d.reason ?? "",
        files: (sheet.documentFiles[d.id] ?? []).map((file) =>
          file.StorageLocation ? `${file.FileName} (${file.StorageLocation})` : file.FileName,
        ),
        suggestion:
          match && (d.reason ?? "").trim() === "" ? `${match.detail} ${match.reason}` : null,
      };
    }),
    documentSummary: documentSummary(sheet.documents),
  };
}
