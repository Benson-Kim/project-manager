import { messages } from "@/lib/messages";
import { PdfWriter, textWidth, type TableColumn } from "@/lib/pdf";
import type { CsvCell } from "@/lib/csv";
import { moscowLabel } from "./schemas/moscow";
import type { RequirementListRow } from "./schemas/requirement";
import { coverageFor, refList } from "./schemas/requirement-rules";
import { canBeMet, typeOrder } from "./schemas/requirement-types";
import { refCell, typeCell } from "./components/register-model";

/**
 * The requirements register as a file the client can print or open in a
 * spreadsheet (client feedback 2026-10-26). Both exports are pure functions of
 * rows the repository has already read and zod-parsed, so the CSV and the PDF
 * cannot disagree about what a requirement says, and neither reaches the
 * database itself.
 *
 * COLUMNS is the one place a column is declared: the header, the cell and how
 * the PDF sizes it. The CSV heading row, the CSV cells and the PDF's table all
 * read it, so a column added here appears in every export at once (client
 * feedback 2026-10-31, check R3: the planning fields were added to the register
 * three days after this file last changed and so were missing from both files).
 *
 * A cell is empty only where the field does not apply to that kind of
 * requirement — a need carries no Met of its own, a test case no coverage.
 * Where the field applies and is unset, the cell says so in words
 * ("Not prioritised", "Unassigned"), because a blank there reads as a failure.
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
 * How the PDF gives a column its width. `fit` columns are sized to the widest
 * thing in them and capped; the rest share what is left, which is where a
 * requirement's prose goes.
 */
type Width = "fit" | "prose";

interface Column {
  header: string;
  cell: (row: RequirementListRow) => string;
  width: Width;
}

function metCell(row: RequirementListRow): string {
  if (!canBeMet(row.RequirementType)) return "";
  return row.IsMet ? M.yes : M.no;
}

function coverageCell(row: RequirementListRow): string {
  return coverageFor(row.RequirementType, row.ValidatedBy) ?? "";
}

/** NULL MoSCoW is "not prioritised yet" (ADR-0052), which is a state and not a blank. */
function moscowCell(row: RequirementListRow): string {
  return row.MoSCoW === null ? M.moscowNone : moscowLabel(row.MoSCoW);
}

/** Days as stored (DECIMAL(6, 1)); an unestimated requirement is blank, never 0. */
function estimateCell(row: RequirementListRow): string {
  return row.EstimateDays === null ? "" : String(row.EstimateDays);
}

/**
 * The owner's name. An owned requirement whose stakeholder was deleted has an id but no name, and
 * neither "Unassigned" nor a blank would be true of it, so it reads as an owner who is gone.
 */
function ownerCell(row: RequirementListRow): string {
  if (row.OwnerStakeholderId === null) return M.unassigned;
  return row.OwnerName ?? M.ownerUnlisted;
}

/**
 * The register's columns, in its order: what a requirement is, then how it is planned
 * (MoSCoW, acceptance criteria, estimate, owner), then what it traces to.
 */
const COLUMNS: readonly Column[] = [
  { header: M.ref, cell: refCell, width: "fit" },
  { header: M.type, cell: typeCell, width: "fit" },
  { header: M.requirement, cell: (row) => row.Requirement, width: "prose" },
  { header: M.moscowTitle, cell: moscowCell, width: "fit" },
  { header: M.acceptanceCriteria, cell: (row) => row.AcceptanceCriteria ?? "", width: "prose" },
  { header: M.estimateDays, cell: estimateCell, width: "fit" },
  { header: M.owner, cell: ownerCell, width: "fit" },
  { header: M.met, cell: metCell, width: "fit" },
  { header: M.validates, cell: (row) => refList(row.Validates), width: "fit" },
  { header: M.validatedBy, cell: (row) => refList(row.ValidatedBy), width: "fit" },
  { header: M.coverage, cell: coverageCell, width: "fit" },
];

const HEADERS = COLUMNS.map((column) => column.header);

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

function cells(row: RequirementListRow): string[] {
  return COLUMNS.map((column) => column.cell(row));
}

/** The register as CSV rows; src/lib/csv.ts does the quoting and the formula guard. */
export function requirementCsvRows(rows: readonly RequirementListRow[]): CsvCell[][] {
  return [[...HEADERS], ...inRegisterOrder(rows).map(cells)];
}

/**
 * Eleven columns on A4 landscape: the table's own size, not the page's, since at the heading's
 * 8pt the prose columns are left about a dozen characters a line, which wraps a requirement into
 * a column of single words.
 */
const SIZE = 6.5;

/** A fitted column is at least this wide, so a one-word heading still reads, and at most that. */
const MIN_FIT = 34;
const MAX_FIT = 78;

/** Narrower than this a prose column stops being prose, so the table scales down instead. */
const MIN_PROSE = 88;

/** Fitted columns take what they need; the prose columns share the rest. */
function columnsFor(rows: string[][], contentWidth: number): TableColumn[] {
  const fitted = new Map<number, number>();
  COLUMNS.forEach((column, i) => {
    if (column.width !== "fit") return;
    // The header is measured too: "Estimate (days)" over a column of single digits would
    // otherwise wrap to three lines and set the height of every row on the page.
    const needed = Math.max(
      textWidth(column.header, SIZE, true) + 8,
      ...rows.map((row) => textWidth(row[i] ?? "", SIZE, true) + 8),
    );
    fitted.set(i, Math.min(MAX_FIT, Math.max(MIN_FIT, needed)));
  });
  const fixed = [...fitted.values()].reduce((a, b) => a + b, 0);
  const prose = COLUMNS.filter((column) => column.width === "prose").length;
  const left = Math.max(contentWidth - fixed, MIN_PROSE * prose);
  return COLUMNS.map((column, i) => ({
    header: column.header,
    width: fitted.get(i) ?? left / prose,
    align: "left" as const,
  }));
}

/**
 * The table's columns for these rows at this width. Exported so the suite can check that eleven
 * columns still fit the page the route asks for, rather than being silently scaled down.
 */
export function requirementPdfColumns(
  rows: readonly RequirementListRow[],
  contentWidth: number,
): TableColumn[] {
  return columnsFor(inRegisterOrder(rows).map(cells), contentWidth);
}

/**
 * The register as a PDF (src/lib/pdf.ts, no dependency): A4 landscape, since the
 * columns and a requirement's prose do not fit portrait.
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
