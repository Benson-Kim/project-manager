import { messages } from "@/lib/messages";
import { PdfWriter, textWidth, type TableColumn } from "@/lib/pdf";
import type { CsvCell } from "@/lib/csv";
import type { RequirementListRow } from "./schemas/requirement";
import { coverageLabel, coverageOf, refList } from "./schemas/requirement-rules";
import { isNeed, typeOrder } from "./schemas/requirement-types";
import { refCell, typeCell } from "./components/register-model";

/**
 * The requirements register as a file the client can print or open in a
 * spreadsheet (client feedback 2026-10-26). Both exports are pure functions of
 * rows the repository has already read and zod-parsed, so the CSV and the PDF
 * cannot disagree about what a requirement says, and neither reaches the
 * database itself.
 *
 * The columns are the register's own, in its order: Ref, Type, Requirement,
 * Met, Validates, Validated by and Coverage. A need carries no Met of its own
 * — only a solution does — so its cell is empty rather than "No", which would
 * read as a failure.
 *
 * Sub-requirements (ADR-0048) are carried, not flattened: the order is the
 * register's tree order and the Ref cell keeps the register's indent, so a
 * spreadsheet shows FR-1.1 under FR-1 rather than as an unrelated row. Both
 * come from register-model, the same two functions the on-screen register
 * renders with, so the file and the page cannot disagree about the shape of
 * the tree.
 */

const M = messages.requirements;

/**
 * The register's order: catalog type order, then the padded tree path — what the list proc returns.
 * SortPath, not Number: a number is only unique under its parent now, so ordering by it would
 * interleave branches. Compared with < and > rather than localeCompare, for the reason refList
 * gives — locale collation can ignore the dots and read "1.10" as "110".
 */
function inRegisterOrder(rows: readonly RequirementListRow[]): RequirementListRow[] {
  return [...rows].sort(
    (a, b) =>
      typeOrder(a.RequirementType) - typeOrder(b.RequirementType) ||
      (a.SortPath < b.SortPath ? -1 : a.SortPath > b.SortPath ? 1 : 0),
  );
}

function metCell(row: RequirementListRow): string {
  if (isNeed(row.RequirementType)) return "";
  return row.IsMet ? M.yes : M.no;
}

function cells(row: RequirementListRow): string[] {
  return [
    refCell(row),
    typeCell(row),
    row.Requirement,
    metCell(row),
    refList(row.Validates),
    refList(row.ValidatedBy),
    isNeed(row.RequirementType) ? coverageLabel(coverageOf(row.ValidatedBy)) : "",
  ];
}

const HEADERS = [
  M.ref,
  M.type,
  M.requirement,
  M.met,
  M.validates,
  M.validatedBy,
  M.coverage,
] as const;

/** The register as CSV rows; src/lib/csv.ts does the quoting and the formula guard. */
export function requirementCsvRows(rows: readonly RequirementListRow[]): CsvCell[][] {
  return [[...HEADERS], ...inRegisterOrder(rows).map(cells)];
}

const SIZE = 8;

/** Text columns share the page; Ref, Type and Met are sized to their content. */
function columnsFor(rows: string[][], contentWidth: number): TableColumn[] {
  const narrow = new Map<number, number>();
  for (const i of [0, 1, 3, 6]) {
    narrow.set(i, Math.max(40, ...rows.map((r) => textWidth(r[i] ?? "", SIZE, true) + 8), 44));
  }
  const fixed = [...narrow.values()].reduce((a, b) => a + b, 0);
  const wide = [2, 4, 5];
  const left = Math.max(contentWidth - fixed, 70 * wide.length);
  return HEADERS.map((header, i) => ({
    header,
    width: narrow.get(i) ?? left / wide.length,
    align: "left" as const,
  }));
}

/**
 * The register as a PDF (src/lib/pdf.ts, no dependency): A4 landscape, since
 * seven columns and a requirement's prose do not fit portrait.
 */
export function requirementPdf(
  rows: readonly RequirementListRow[],
  projectName: string,
  generatedOn: string,
): Uint8Array {
  const title = M.exportTitle(projectName);
  const pdf = new PdfWriter({
    title,
    landscape: true,
    footer: `${title}  ·  ${M.generatedOn(generatedOn)}`,
  });

  pdf.paragraph(title, 16, true, 2);
  pdf.paragraph(M.exportCount(rows.length), 10, false, 8);

  const body = inRegisterOrder(rows).map(cells);
  if (body.length > 0) pdf.table(columnsFor(body, pdf.contentWidth), body, SIZE);
  else pdf.paragraph(M.emptyBody, 10);

  return pdf.toBytes();
}
