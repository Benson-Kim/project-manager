import type { Section } from "../calc/engine";
import type { LineDto } from "../schemas/financial";

/**
 * The budget datasheet's cells (ADR-0029 amendment): a cell edits one field of
 * a line as the text the line sheet sends, so both go through the same line
 * actions and validation. A year's pre-tax amount is the field
 * "amounts.<fiscal year>".
 */

const AMOUNT = "amounts.";

export function amountField(year: number): string {
  return `${AMOUNT}${year}`;
}

/** A line as its create and update actions take it. */
export interface LineValues {
  section: Section;
  description: string;
  costCategory: string;
  fundingSource: string;
  supplier: string;
  glAccount: string;
  taxProfileId: string;
  isRecurrent: boolean;
  comments: string;
  amounts: { fiscalYear: number; amount: string }[];
}

/** The typed amounts of `years`, in order; blank years are left out. */
function typedAmounts(amounts: Partial<Record<number, string>>, years: readonly number[]) {
  return years
    .filter((year) => (amounts[year] ?? "").trim() !== "")
    .map((year) => ({ fiscalYear: year, amount: amounts[year]!.trim() }));
}

export function lineValues(line: LineDto, years: readonly number[]): LineValues {
  return {
    section: line.section,
    description: line.description,
    costCategory: line.costCategory ?? "",
    fundingSource: line.fundingSource ?? "",
    supplier: line.supplier ?? "",
    glAccount: line.glAccount ?? "",
    taxProfileId: line.taxProfileId === null ? "" : String(line.taxProfileId),
    isRecurrent: line.isRecurrent,
    comments: line.comments ?? "",
    amounts: typedAmounts(line.amounts, years),
  };
}

/** The line with one cell's text in place: what a cell edit sends, and shows until the refresh. */
export function withCell(line: LineDto, field: string, value: string): LineDto {
  if (field.startsWith(AMOUNT)) {
    return { ...line, amounts: { ...line.amounts, [Number(field.slice(AMOUNT.length))]: value } };
  }
  switch (field) {
    case "description":
      return { ...line, description: value };
    case "costCategory":
    case "fundingSource":
      return { ...line, [field]: value || null };
    case "taxProfileId":
      return { ...line, taxProfileId: value ? Number(value) : null };
    case "isRecurrent":
      return { ...line, isRecurrent: value === "on" };
    default:
      return line;
  }
}

/** A new line in `section` from the new-entry row's draft (cell field -> text). */
export function newLineValues(
  section: Section,
  draft: Record<string, string>,
  years: readonly number[],
): LineValues {
  return {
    section,
    description: draft.description ?? "",
    costCategory: draft.costCategory ?? "",
    fundingSource: draft.fundingSource ?? "",
    supplier: "",
    glAccount: "",
    taxProfileId: draft.taxProfileId ?? "",
    isRecurrent: draft.isRecurrent === "on",
    comments: "",
    amounts: typedAmounts(
      Object.fromEntries(years.map((year) => [year, draft[amountField(year)]])),
      years,
    ),
  };
}

/**
 * The action's field errors keyed by cell: an amount's error ("amounts.<n>.amount",
 * n counting the amounts sent) names its year's cell.
 */
export function cellErrors(
  fieldErrors: Record<string, string[]> | undefined,
  sent: LineValues,
): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(fieldErrors ?? {}).map(([key, list]) => {
      const index = /^amounts\.(\d+)\./.exec(key)?.[1];
      const year = index === undefined ? undefined : sent.amounts[Number(index)]?.fiscalYear;
      return [year === undefined ? key : amountField(year), list];
    }),
  );
}
