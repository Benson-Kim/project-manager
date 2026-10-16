import { readFileSync } from "node:fs";
import { join } from "node:path";

/** The default template document as migration 027 seeds it (quotes un-doubled). */
export function migrationTemplateDefinition(): string {
  const sql = readFileSync(join("db", "migrations", "027_financial_calculator.sql"), "utf8");
  const match = /N'(\{[\s\S]*?\})', 1, 0\)/.exec(sql);
  if (!match) throw new Error("default template not found in migration 027");
  return match[1]!.replace(/''/g, "'");
}

export function templateRow(overrides: Record<string, unknown> = {}) {
  return {
    FinancialTemplateId: 1,
    Name: "Standard",
    Definition: migrationTemplateDefinition(),
    IsDefault: true,
    CreatedAtUtc: new Date("2026-10-16T00:00:00Z"),
    UpdatedAtUtc: null,
    RowVer: "9",
    ...overrides,
  };
}

/** dbo.ufn_Financial_Row as the driver returns it: DECIMAL columns arrive as floats. */
export function financialRow(overrides: Record<string, unknown> = {}) {
  return {
    FinancialId: 4,
    ProjectId: 2,
    Title: "Budget Execution",
    TemplateName: "Standard",
    ProjectNumber: 1021995,
    Acquisition: null,
    GlGrandLivre: "9300867-70560",
    BudgetEnvelope: "PMT EIRI",
    Budget: 100000,
    BudgetIncludesTax: true,
    SpendBy: null,
    RecurrentFees: null,
    ContractTimeframe: null,
    FirstFiscalYear: 2023,
    HorizonYears: 5,
    FiscalYearStartMonth: 4,
    EscalationRate: 0.05,
    FlagThresholdRate: 0.1,
    CostCategories: '["Acquisition"]',
    FundingSources: "[]",
    CreatedAtUtc: new Date("2026-10-16T00:00:00Z"),
    UpdatedAtUtc: null,
    RowVer: "77",
    ...overrides,
  };
}

function line(
  id: number,
  section: string,
  description: string,
  taxProfileId: number | null,
  sortOrder: number,
) {
  return {
    FinancialLineId: id,
    Section: section,
    Description: description,
    CostCategory: null,
    FundingSource: null,
    Supplier: null,
    GlAccount: null,
    FinancialTaxProfileId: taxProfileId,
    IsRecurrent: false,
    Comments: null,
    SortOrder: sortOrder,
    RowVer: String(100 + id),
  };
}

/** usp_Financial_GetSheet's five result sets for the workbook's Budget Execution tab. */
export function workbookSheetSets(): unknown[][] {
  return [
    [financialRow()],
    [
      {
        FinancialTaxProfileId: 1,
        Name: "Net tax (public body)",
        Rate: 0.056879,
        SortOrder: 1,
        Steps: "[]",
        RowVer: "5",
      },
    ],
    [
      line(11, "operating", "Project management", 1, 1),
      line(12, "operating", "System management", 1, 2),
      line(13, "operating", "Programmer", null, 3),
      line(19, "capital", "12 hours for networking installation", 1, 1),
      line(20, "capital", "8 hours Remote Assist training", 1, 2),
    ],
    [
      { FinancialLineId: 11, FiscalYear: 2023, Amount: 350 },
      { FinancialLineId: 12, FiscalYear: 2023, Amount: 5000 },
      { FinancialLineId: 13, FiscalYear: 2023, Amount: 1000 },
      { FinancialLineId: 19, FiscalYear: 2023, Amount: 9000 },
      { FinancialLineId: 20, FiscalYear: 2023, Amount: 6000 },
    ],
    [
      tx(1, 11, 150, 0.056879),
      tx(2, 12, 4980, 0.056879),
      tx(3, 13, 1000, 0),
      tx(4, 19, 5000, 0.056879),
      tx(5, 20, 500, 0.056879),
      tx(6, 20, 2500, 0.056879),
      tx(7, 20, 3000, 0.056879),
    ],
  ];
}

function tx(id: number, lineId: number, amount: number, rate: number) {
  return {
    FinancialTransactionId: id,
    FinancialLineId: lineId,
    FiscalYear: 2023,
    TransactionDate: "2023-11-0" + (id % 9 || 1),
    Reference: `Facture ${id}`,
    Description: null,
    Amount: amount,
    TaxRate: rate,
    RowVer: String(200 + id),
  };
}
