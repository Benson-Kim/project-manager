import { describe, expect, it } from "vitest";
import { toCsv } from "@/lib/csv";
import { financialCsvRows } from "../calc/export";
import { toSheetDto } from "../schemas/financial";
import { workbookSheetSets } from "./fixtures";

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
