import { describe, expect, it } from "vitest";
import { toCsv } from "@/lib/csv";
import { financialCsvRows, projectCsvRows } from "../calc/export";
import { toSheetDto } from "../schemas/financial";
import { financialRow, workbookSheetSets } from "./fixtures";

describe("financial CSV export", () => {
  const sheet = toSheetDto(workbookSheetSets());
  const rows = financialCsvRows(sheet);
  const csv = toCsv(rows);
  const lines = csv.slice(1).split("\r\n");

  it("writes the Budget Execution layout with the workbook's figures", () => {
    const header = lines.find((l) => l.startsWith("Description,Section"))!;
    expect(header).toContain("2023-2024 Before tax,2023-2024 Tax included");
    expect(header).toContain("2027-2028 Tax included");
    expect(lines).toContain(
      "Project management,Operating fund expenditures,,,,,Net tax (public body),,350.00,369.91,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,350.00,369.91,",
    );
    expect(lines.find((l) => l.startsWith("Total,"))).toContain("21350.00,22507.49");
  });

  it("adds monitoring and transactions", () => {
    expect(lines).toContain("System management,5000.00,4980.00,20.00,5284.40,21.14,Low balance");
    expect(lines.filter((l) => l.startsWith("2023-11-0"))).toHaveLength(7);
    expect(lines.find((l) => l.includes("Facture 4"))).toContain(",5000.00,5.6879");
  });

  it("neutralises formula text a user typed", () => {
    const hostile = {
      ...sheet,
      lines: [{ ...sheet.lines[0]!, description: '=HYPERLINK("http://x","y")' }],
    };
    expect(toCsv(financialCsvRows(hostile))).toContain(`"'=HYPERLINK(""http://x"",""y"")"`);
  });
});

describe("a currency names the money columns (ADR-0051)", () => {
  const sets = workbookSheetSets();
  sets[0] = [financialRow({ CurrencyCode: "USD" })];
  const lines = toCsv(financialCsvRows(toSheetDto(sets)))
    .slice(1)
    .split("\r\n");

  it("suffixes every money header and leaves the cells bare", () => {
    const header = lines.find((l) => l.startsWith("Description,Section"))!;
    expect(header).toContain("2023-2024 Before tax (USD),2023-2024 Tax included (USD)");
    expect(header).toContain("Total before tax (USD),Total tax included (USD)");
    expect(lines).toContain(
      "Project management,Operating fund expenditures,,,,,Net tax (public body),,350.00,369.91,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,350.00,369.91,",
    );
  });

  it("suffixes the budget, monitoring and transaction headers too", () => {
    expect(lines.find((l) => l.startsWith("Authorised budget"))).toContain(
      "Authorised budget (tax included) (USD),",
    );
    expect(lines.find((l) => l.startsWith("Description,Budget"))).toContain(
      "Budget (before tax) (USD),Spent (before tax) (USD),Balance (before tax) (USD)",
    );
    expect(lines.find((l) => l.includes("Amount before tax"))).toContain("Amount before tax (USD)");
  });
});

describe("the project export carries a currency column instead", () => {
  const usd = workbookSheetSets();
  usd[0] = [financialRow({ CurrencyCode: "USD" })];
  const jpy = workbookSheetSets();
  jpy[0] = [financialRow({ FinancialId: 5, Title: "Second", CurrencyCode: "JPY" })];
  const rows = projectCsvRows([toSheetDto(usd), toSheetDto(jpy)]);
  const header = rows[0] as string[];
  const col = header.indexOf("Currency");

  it("names each financial's own currency in a cell, since no header could", () => {
    expect(col).toBeGreaterThan(-1);
    expect(rows[1]![col]).toBe("USD");
    expect(rows[2]![col]).toBe("JPY");
    expect(header.filter((h) => /\((?:USD|JPY)\)$/.test(h))).toEqual([]);
  });

  it("leaves the cell empty for a financial with no currency", () => {
    const none = projectCsvRows([toSheetDto(workbookSheetSets())]);
    expect(none[1]![col]).toBeNull();
  });
});
