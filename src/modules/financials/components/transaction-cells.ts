import { fiscalYearOf } from "../calc/fiscal";
import type { TransactionDto } from "../schemas/financial";

/**
 * The transactions datasheet's cells (ADR-0029 amendment): a cell edits one
 * field of a transaction as the text the transaction sheet sends, so both go
 * through the same actions and validation.
 */

/** A transaction as its create and update actions take it. */
export interface TransactionValues {
  lineId: string;
  date: string;
  /** "" takes the fiscal year from the date. */
  fiscalYear: string;
  reference: string;
  description: string;
  amount: string;
}

/**
 * A transaction's values for its update action. A fiscal year that is the one
 * its date falls in goes as "" (from the date), so a new date moves it too.
 */
export function transactionValues(t: TransactionDto, startMonth: number): TransactionValues {
  return {
    lineId: String(t.lineId),
    date: t.date,
    fiscalYear: t.fiscalYear === fiscalYearOf(t.date, startMonth) ? "" : String(t.fiscalYear),
    reference: t.reference ?? "",
    description: t.description ?? "",
    amount: t.amount,
  };
}

/** The transaction with one cell's text in place: what a cell edit sends, and shows until the refresh. */
export function withTransactionCell(
  t: TransactionDto,
  field: string,
  value: string,
  startMonth: number,
): TransactionDto {
  const fromDate = (date: string) => fiscalYearOf(date, startMonth) ?? t.fiscalYear;
  switch (field) {
    case "lineId":
      return { ...t, lineId: Number(value) };
    case "date":
      return {
        ...t,
        date: value,
        fiscalYear:
          t.fiscalYear === fiscalYearOf(t.date, startMonth) ? fromDate(value) : t.fiscalYear,
      };
    case "fiscalYear":
      return { ...t, fiscalYear: value ? Number(value) : fromDate(t.date) };
    case "reference":
    case "description":
      return { ...t, [field]: value || null };
    case "amount":
      return { ...t, amount: value };
    default:
      return t;
  }
}

/** A new transaction from the new-entry row's draft (cell field -> text). */
export function newTransactionValues(draft: Record<string, string>): TransactionValues {
  return {
    lineId: draft.lineId ?? "",
    date: draft.date ?? "",
    fiscalYear: draft.fiscalYear ?? "",
    reference: draft.reference ?? "",
    description: draft.description ?? "",
    amount: draft.amount ?? "",
  };
}
