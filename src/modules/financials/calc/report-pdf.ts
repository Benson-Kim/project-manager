import { PdfWriter, textWidth, type TableColumn } from "@/lib/pdf";
import { messages } from "@/lib/messages";
import type { FinancialReport, ReportTable } from "./report";

/**
 * The financial report (calc/report.ts) as a PDF (ADR-0030): A4 landscape, so
 * seven fiscal years fit one row. Amount columns are sized to their widest
 * figure; text columns share what is left.
 */

const M = messages.financials;
const SIZE = 8;

function columnsFor(table: ReportTable, contentWidth: number): TableColumn[] {
  const numeric = new Set(table.numeric);
  const amountWidth = (i: number) =>
    Math.max(
      44,
      ...table.rows.map((r) => textWidth(r[i] ?? "", SIZE, true) + 8),
      Math.min(textWidth(table.columns[i]!, SIZE, true) + 8, 90),
    );
  const fixed = table.columns.map((_, i) => (numeric.has(i) ? amountWidth(i) : 0));
  const textCount = table.columns.length - numeric.size;
  const left = Math.max(contentWidth - fixed.reduce((a, b) => a + b, 0), 80 * textCount);
  return table.columns.map((header, i) => ({
    header,
    width: numeric.has(i) ? fixed[i]! : left / textCount,
    align: numeric.has(i) ? "right" : "left",
  }));
}

export function financialPdf(report: FinancialReport, generatedOn: string): Uint8Array {
  const pdf = new PdfWriter({
    title: M.printTitle(report.title),
    landscape: true,
    footer: `${M.printTitle(report.title)}  ·  ${M.generatedOn(generatedOn)}`,
  });

  pdf.paragraph(M.printTitle(report.title), 16, true, 2);
  pdf.paragraph(report.period, 10, false, 8);

  pdf.paragraph(M.breakdown, 12, true, 2);
  for (const [label, value] of report.fields) pdf.paragraph(`${label}: ${value}`, 9, false, 0);
  pdf.y -= 8;

  for (const table of report.tables) {
    pdf.paragraph(table.heading, 12, true, 2);
    if (table.rows.length === 0) {
      pdf.paragraph(M.documents.none, 9, false, 6);
      continue;
    }
    pdf.table(columnsFor(table, pdf.contentWidth), table.rows, SIZE, table.strong);
  }

  const D = M.documents;
  pdf.paragraph(D.heading, 12, true, 2);
  const s = report.documentSummary;
  pdf.paragraph(D.summary(s.required, s.requiredWithFile, s.undecided), 9, false, 4);
  if (report.documents.length === 0) {
    pdf.paragraph(D.empty, 9);
  } else {
    pdf.table(
      [
        { header: D.name, width: 170 },
        { header: D.required, width: 80 },
        { header: D.reason, width: 260 },
        { header: D.files, width: 260 },
      ],
      report.documents.map((d) => [
        d.name,
        d.required,
        d.reason || (d.suggestion ? `${D.suggestion}: ${d.suggestion}` : ""),
        d.files.join("\n"),
      ]),
      SIZE,
    );
  }
  return pdf.toBytes();
}
