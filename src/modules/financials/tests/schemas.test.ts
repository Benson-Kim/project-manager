import { describe, expect, it } from "vitest";
import { calculateSheet } from "../calc/sheet";
import {
  budgetAmountText,
  labelListSchema,
  labelsFromText,
  optionalBudgetAmountText,
  percentText,
  transactionAmountText,
} from "../schemas/fields";
import {
  createFinancialInput,
  createLineInput,
  createTransactionInput,
  setTaxProfilesInput,
  toSheetDto,
  updateFinancialInput,
  updateLineInput,
} from "../schemas/financial";
import {
  saveTemplateInput,
  templateDefinitionInput,
  templateDefinitionSchema,
  toTemplate,
  templateRowSchema,
} from "../schemas/template";
import { migrationTemplateDefinition, templateRow, workbookSheetSets } from "./fixtures";

describe("field schemas", () => {
  it("canonicalises typed amounts and rates", () => {
    expect(budgetAmountText.parse("1,250.5")).toBe("1250.50");
    expect(budgetAmountText.parse(12)).toBe("12.00");
    expect(budgetAmountText.safeParse("-1").success).toBe(false);
    expect(budgetAmountText.safeParse("1.234").success).toBe(false);
    expect(transactionAmountText.parse("-100")).toBe("-100.00");
    expect(transactionAmountText.safeParse("0").success).toBe(false);
    expect(transactionAmountText.safeParse("abc").success).toBe(false);
    expect(optionalBudgetAmountText.parse("")).toBeNull();
    expect(optionalBudgetAmountText.parse(null)).toBeNull();
    expect(optionalBudgetAmountText.parse(undefined)).toBeNull();
    expect(optionalBudgetAmountText.parse("10")).toBe("10.00");
    expect(percentText.parse("5.6879")).toBe("0.056879");
    expect(percentText.parse(5)).toBe("0.050000");
    expect(percentText.safeParse("101").success).toBe(false);
  });

  it("checks label lists", () => {
    expect(labelsFromText(" a \n\nb\r\n")).toEqual(["a", "b"]);
    expect(labelListSchema.safeParse(["a", "a"]).success).toBe(false);
    expect(labelListSchema.safeParse(["x".repeat(151)]).success).toBe(false);
    expect(labelListSchema.safeParse(Array.from({ length: 201 }, (_, i) => `l${i}`)).success).toBe(
      false,
    );
  });
});

describe("templates", () => {
  it("reads the default template seeded by migration 027", () => {
    const def = templateDefinitionSchema.parse(JSON.parse(migrationTemplateDefinition()));
    expect(def.taxProfiles[0]).toEqual({
      key: "t1",
      name: "Net tax (public body)",
      rate: "0.056879",
      isDefault: true,
    });
    expect(def.costCategories).toHaveLength(8);
    expect(def.fundingSources).toHaveLength(33);
    expect(def.costCategories).toContain("Rémunération du personnel d'un autre OP en PS");
    expect(def.lines.map((l) => l.section)).toEqual([
      "operating",
      "operating",
      "operating",
      "capital",
      "capital",
    ]);
    const template = toTemplate(templateRowSchema.parse(templateRow()));
    expect(template).toMatchObject({ id: 1, isDefault: true, rowVer: 9 });
  });

  it("converts the editor's percentages and amounts to the stored form", () => {
    const parsed = templateDefinitionInput.parse({
      horizonYears: "7",
      fiscalYearStartMonth: 4,
      escalationRate: "5",
      flagThresholdRate: "10",
      taxProfiles: [{ key: "t1", name: " Net ", rate: "5.6879", isDefault: true }],
      costCategories: ["Acquisition"],
      fundingSources: [],
      lines: [
        { section: "capital", description: " Networking ", taxProfileKey: "t1", amount: "9,000" },
        { section: "other", description: "Grant", costCategory: "", taxProfileKey: "", amount: "" },
      ],
    });
    expect(parsed.escalationRate).toBe("0.050000");
    expect(parsed.taxProfiles[0]!.name).toBe("Net");
    expect(parsed.lines[0]).toMatchObject({
      description: "Networking",
      amount: "9000.00",
      isRecurrent: false,
    });
    expect(parsed.lines[1]).toMatchObject({
      costCategory: null,
      taxProfileKey: null,
      amount: null,
    });
    expect(templateDefinitionSchema.safeParse(parsed).success).toBe(true);
  });

  it("rejects unknown tax keys, duplicate profiles and too many lines", () => {
    const base = {
      horizonYears: 5,
      fiscalYearStartMonth: 4,
      escalationRate: "0",
      flagThresholdRate: "10",
      taxProfiles: [{ key: "t1", name: "A", rate: "1" }],
      costCategories: [],
      fundingSources: [],
      lines: [],
    };
    expect(
      templateDefinitionInput.safeParse({
        ...base,
        lines: [{ section: "other", description: "x", taxProfileKey: "zz" }],
      }).success,
    ).toBe(false);
    expect(
      templateDefinitionInput.safeParse({
        ...base,
        taxProfiles: [...base.taxProfiles, { key: "t2", name: "A", rate: "2" }],
      }).success,
    ).toBe(false);
    expect(templateDefinitionInput.safeParse({ ...base, horizonYears: 8 }).success).toBe(false);
    expect(
      templateDefinitionInput.safeParse({
        ...base,
        lines: Array.from({ length: 301 }, () => ({ section: "other", description: "x" })),
      }).success,
    ).toBe(false);
    expect(saveTemplateInput.safeParse({ name: " ", definition: base }).success).toBe(false);
  });
});

describe("financial inputs", () => {
  it("ignores fields an action does not take (no mass assignment)", () => {
    const parsed = updateLineInput.parse({
      lineId: "5",
      financialId: 999,
      projectId: 999,
      taxRate: "0",
      section: "capital",
      description: "Networking",
      taxProfileId: "",
      amounts: [{ fiscalYear: 2023, amount: "9,000" }],
      rowVer: "12",
    });
    expect(parsed).not.toHaveProperty("financialId");
    expect(parsed).not.toHaveProperty("projectId");
    expect(parsed).not.toHaveProperty("taxRate");
    expect(parsed).toMatchObject({
      lineId: 5,
      taxProfileId: null,
      amounts: [{ fiscalYear: 2023, amount: "9000.00" }],
      rowVer: 12,
    });
    const tx = createTransactionInput.parse({
      lineId: 3,
      date: "2024-03-31",
      amount: "5000",
      taxRate: "0",
      fiscalYear: "",
    });
    expect(tx).not.toHaveProperty("taxRate");
    expect(tx.fiscalYear).toBeNull();
  });

  it("validates lines, financials and profiles", () => {
    expect(
      createLineInput.safeParse({ financialId: 1, section: "admin", description: "x", amounts: [] })
        .success,
    ).toBe(false);
    expect(
      createLineInput.safeParse({
        financialId: 1,
        section: "other",
        description: "x",
        amounts: [
          { fiscalYear: 2023, amount: "1" },
          { fiscalYear: 2023, amount: "2" },
        ],
      }).success,
    ).toBe(false);
    expect(
      createLineInput.safeParse({
        financialId: 1,
        section: "other",
        description: "x",
        amounts: [{ fiscalYear: 2023, amount: "-1" }],
      }).success,
    ).toBe(false);
    expect(
      createFinancialInput.parse({
        projectId: "2",
        title: "B",
        templateId: "",
        firstFiscalYear: "2023",
      }),
    ).toEqual({
      projectId: 2,
      title: "B",
      templateId: null,
      firstFiscalYear: 2023,
    });
    expect(
      createFinancialInput.safeParse({ projectId: 2, title: "B", firstFiscalYear: 1999 }).success,
    ).toBe(false);
    const update = updateFinancialInput.parse({
      financialId: 4,
      title: "Budget",
      projectNumber: "",
      budget: "100,000",
      recurrentFees: "",
      firstFiscalYear: 2023,
      horizonYears: 5,
      startMonth: 4,
      escalationRate: "5",
      flagThresholdRate: "10",
      costCategories: [],
      fundingSources: [],
      rowVer: 3,
    });
    expect(update).toMatchObject({
      projectNumber: null,
      budget: "100000.00",
      recurrentFees: null,
      escalationRate: "0.050000",
    });
    expect(updateFinancialInput.safeParse({ ...update, horizonYears: 8 }).success).toBe(false);
    expect(
      setTaxProfilesInput.safeParse({
        financialId: 1,
        rowVer: 1,
        profiles: [
          { name: "A", rate: "1" },
          { name: "A", rate: "2" },
        ],
      }).success,
    ).toBe(false);
    expect(
      setTaxProfilesInput.parse({
        financialId: 1,
        rowVer: 1,
        profiles: [{ id: "", name: "A", rate: "1" }],
      }).profiles[0],
    ).toEqual({
      id: null,
      name: "A",
      rate: "0.010000",
      steps: [],
    });
    const stepped = setTaxProfilesInput.parse({
      financialId: 1,
      rowVer: 1,
      profiles: [{ name: "A", rate: "5.6879", steps: [{ fromFiscalYear: "2026", rate: "6" }] }],
    });
    expect(stepped.profiles[0]!.steps).toEqual([{ fromFiscalYear: 2026, rate: "0.060000" }]);
    expect(
      setTaxProfilesInput.safeParse({
        financialId: 1,
        rowVer: 1,
        profiles: [
          {
            name: "A",
            rate: "1",
            steps: [
              { fromFiscalYear: 2026, rate: "2" },
              { fromFiscalYear: 2026, rate: "3" },
            ],
          },
        ],
      }).success,
    ).toBe(false);
    expect(update.budgetIncludesTax).toBe(true);
  });
});

describe("sheet", () => {
  it("turns driver floats into exact decimal text", () => {
    const sheet = toSheetDto(workbookSheetSets());
    expect(sheet.financial).toMatchObject({
      budget: "100000.00",
      escalationRate: "0.050000",
      flagThresholdRate: "0.100000",
      costCategories: ["Acquisition"],
    });
    expect(sheet.profiles[0]).toEqual({
      id: 1,
      name: "Net tax (public body)",
      rate: "0.056879",
      steps: [],
    });
    expect(sheet.financial.budgetIncludesTax).toBe(true);
    const withSteps = workbookSheetSets();
    (withSteps[1]![0] as { Steps: string }).Steps = '[{"fromFiscalYear":2026,"rate":0.06}]';
    expect(toSheetDto(withSteps).profiles[0]!.steps).toEqual([
      { fromFiscalYear: 2026, rate: "0.060000" },
    ]);
    expect(sheet.lines[0]!.amounts).toEqual({ 2023: "350.00" });
    expect(sheet.transactions[0]).toMatchObject({
      amount: "150.00",
      taxRate: "0.056879",
      rowVer: 201,
    });
    expect(
      toSheetDto([
        [{ ...(workbookSheetSets()[0]![0] as object), CostCategories: "{}" }],
        [],
        [],
        [],
        [],
      ]).financial.costCategories,
    ).toEqual([]);
  });

  it("calculates the workbook from a loaded sheet", () => {
    const { plan, monitor } = calculateSheet(toSheetDto(workbookSheetSets()));
    expect(plan.total.withTax).toBe(2250749n);
    expect(monitor.total.total.spentBeforeTax).toBe(1713000n);
    expect(monitor.lines.get(12)!.total.status).toBe("low");
  });
});
