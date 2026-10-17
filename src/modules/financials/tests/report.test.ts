import { describe, expect, it } from "vitest";
import { toCsv } from "@/lib/csv";
import { financialCsvRows, projectCsvRows } from "../calc/export";
import { financialReport } from "../calc/report";
import { financialPdf } from "../calc/report-pdf";
import { toSheetDto } from "../schemas/financial";
import { documentRow, financialRow, workbookSheetSets } from "./fixtures";

const sheet = () => toSheetDto(workbookSheetSets());

describe("financial report (ADR-0030)", () => {
  it("summarises the budget by section with a total row", () => {
    const report = financialReport(sheet());
    const budget = report.tables[0]!;
    expect(budget.rows.map((r) => r[0])).toEqual([
      "Operating fund expenditures",
      "Investments: capital fund",
      "Other sources of financing",
      "Total",
    ]);
    expect(budget.strong).toEqual([3]);
    expect(budget.rows[3]!.at(-2)).toBe("21,350.00");
    expect(report.fields).toContainEqual(["Project number", "1021995"]);
  });

  it("lists documents with files, and a suggestion only while no reason is typed", () => {
    const sets = workbookSheetSets();
    sets[0] = [financialRow({ Budget: 50000 })];
    const report = financialReport(toSheetDto(sets));
    expect(report.documents.map((d) => [d.name, d.required, d.files])).toEqual([
      ["DA (Dossier d'affaires)", "Not decided", []],
      ["Signed direct contract", "Required", ["contract.pdf"]],
      ["A1", "Not required", []],
    ]);
    expect(report.documents[0]!.suggestion).toContain("Under 200,000 $.");
    expect(report.documents[2]!.suggestion).toBeNull();
  });
});

describe("financial PDF", () => {
  it("renders hostile document names as escaped text", () => {
    const sets = workbookSheetSets();
    sets[5] = [documentRow(40, "Réquisition (copie) \\ test) Tj ET", false, 1, [], 0, "a\nb")];
    sets[6] = [];
    const text = new TextDecoder("latin1").decode(
      financialPdf(financialReport(toSheetDto(sets)), "2026-10-16"),
    );
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text).toContain("(R\\351quisition \\(copie\\) \\\\ test\\) Tj ET) Tj");
    expect(/[^\x09\x0a\x0d\x20-\x7e]/.test(text)).toBe(false);
  });
});

describe("CSV exports", () => {
  it("appends the checklist to the financial's CSV", () => {
    const csv = toCsv(financialCsvRows(sheet()));
    expect(csv).toContain("Financial documents required?");
    expect(csv).toContain("Signed direct contract,Required,,contract.pdf");
    expect(csv).toContain("A1,Not required,Not needed,");
  });

  it("writes one row per financial with a column per document name", () => {
    const a = sheet();
    const setsB = workbookSheetSets();
    setsB[0] = [financialRow({ FinancialId: 5, Title: "=HYPERLINK(1)" })];
    setsB[5] = [documentRow(50, "Extra", false, 1, [], 0, "Covered elsewhere")];
    setsB[6] = [];
    const rows = projectCsvRows([a, toSheetDto(setsB)]);
    const header = rows[0] as string[];
    expect(header.slice(-4)).toEqual([
      "DA (Dossier d'affaires)",
      "Signed direct contract",
      "A1",
      "Extra",
    ]);
    expect(rows[1]!.slice(-4)).toEqual([
      "Not decided",
      "Required",
      "Not required: Not needed",
      null,
    ]);
    expect(rows[2]!.slice(-4)).toEqual([null, null, null, "Not required: Covered elsewhere"]);
    expect(toCsv(rows)).toContain("'=HYPERLINK(1)");
  });
});

describe("hostile text and casing in the outputs", () => {
  it("neutralises a formula in a document name used as a header and in a reason", () => {
    const sets = workbookSheetSets();
    sets[5] = [documentRow(60, "=cmd|' /C calc'!A0", false, 1, [], 0, "+SUM(A1:A9)")];
    sets[6] = [];
    const csv = toCsv(projectCsvRows([toSheetDto(sets)]));
    expect(csv).toContain(",'=cmd|' /C calc'!A0");
    expect(csv).toContain(",Not required: +SUM(A1:A9)");
    expect(csv).not.toMatch(/(^|,)[=+\-@]/m);
  });

  it("groups document columns case-insensitively, headed by the first spelling", () => {
    const setsB = workbookSheetSets();
    setsB[0] = [financialRow({ FinancialId: 6 })];
    setsB[5] = [documentRow(70, "a1", true, 1)];
    setsB[6] = [];
    const rows = projectCsvRows([sheet(), toSheetDto(setsB)]);
    const header = rows[0] as string[];
    expect(header.filter((h) => h.toLowerCase() === "a1")).toEqual(["A1"]);
    const col = header.indexOf("A1");
    expect(rows[1]![col]).toBe("Not required: Not needed");
    expect(rows[2]![col]).toBe("Required");
  });

  it("prints each attached file on its own line in the PDF", () => {
    const sets = workbookSheetSets();
    sets[6] = [
      ...(sets[6] as object[]),
      { ...(sets[6]![0] as object), FileAttachmentId: 902, FileName: "annex.pdf", RowVer: "301" },
    ];
    const text = new TextDecoder("latin1").decode(
      financialPdf(financialReport(toSheetDto(sets)), "2026-10-16"),
    );
    expect(text).toMatch(/\(contract\.pdf\) Tj ET\nBT [^\n]*\(annex\.pdf\) Tj/);
  });
});
