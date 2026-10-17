import { describe, expect, it } from "vitest";
import {
  newTransactionValues,
  transactionValues,
  withTransactionCell,
} from "../components/transaction-cells";
import type { TransactionDto } from "../schemas/financial";

/** Fiscal years start in April: 2023-11-01 falls in 2023-2024, 2024-02-01 too. */
const APRIL = 4;

const invoice: TransactionDto = {
  id: 5,
  lineId: 7,
  fiscalYear: 2023,
  date: "2023-11-01",
  reference: "F-1",
  description: null,
  amount: "150.00",
  taxRate: "0.056879",
  rowVer: 9,
};

describe("transactions datasheet cells (ADR-0029 amendment)", () => {
  it("sends the year its date gives as from the date, and a chosen year as itself", () => {
    expect(transactionValues(invoice, APRIL)).toEqual({
      lineId: "7",
      date: "2023-11-01",
      fiscalYear: "",
      reference: "F-1",
      description: "",
      amount: "150.00",
    });
    expect(transactionValues({ ...invoice, fiscalYear: 2024 }, APRIL).fiscalYear).toBe("2024");
  });

  it("moves a year that followed its date with a new date, and keeps a chosen one", () => {
    expect(withTransactionCell(invoice, "date", "2024-05-02", APRIL)).toMatchObject({
      date: "2024-05-02",
      fiscalYear: 2024,
    });
    const chosen = { ...invoice, fiscalYear: 2025 };
    expect(withTransactionCell(chosen, "date", "2024-05-02", APRIL).fiscalYear).toBe(2025);
    expect(withTransactionCell(chosen, "fiscalYear", "", APRIL).fiscalYear).toBe(2023);
  });

  it("puts one cell's text in place and keeps the rest", () => {
    expect(withTransactionCell(invoice, "lineId", "8", APRIL)).toMatchObject({
      lineId: 8,
      reference: "F-1",
    });
    expect(withTransactionCell(invoice, "reference", "", APRIL).reference).toBeNull();
    expect(withTransactionCell(invoice, "amount", "1,200", APRIL).amount).toBe("1,200");
  });

  it("builds a new transaction from the new-entry row", () => {
    expect(newTransactionValues({ lineId: "7", date: "2024-01-15", amount: "80" })).toEqual({
      lineId: "7",
      date: "2024-01-15",
      fiscalYear: "",
      reference: "",
      description: "",
      amount: "80",
    });
  });
});
