import { beforeEach, describe, expect, it, vi } from "vitest";

const execProc = vi.fn();
const execProcSets = vi.fn();
vi.mock("@/lib/db", () => ({
  execProc: (...args: unknown[]) => execProc(...args) as Promise<unknown[]>,
  execProcSets: (...args: unknown[]) => execProcSets(...args) as Promise<unknown[][]>,
}));

import { listParamsSchema } from "@/lib/list-params";
import {
  createFinancialInput,
  createLineInput,
  createTransactionInput,
  setTaxProfilesInput,
  updateFinancialInput,
  updateLineInput,
  updateTransactionInput,
} from "../schemas/financial";
import { saveTemplateInput } from "../schemas/template";
import {
  createFinancial,
  createLine,
  createTransaction,
  deleteFinancial,
  deleteLine,
  deleteTransaction,
  getFinancialSheet,
  listFinancials,
  moveLine,
  setTaxProfiles,
  updateFinancial,
  updateLine,
  updateTransaction,
} from "../repository/financials";
import { deleteTemplate, getTemplate, listTemplates, saveTemplate } from "../repository/templates";
import { financialRow, templateRow, workbookSheetSets } from "./fixtures";

const savedLine = {
  FinancialLineId: 8,
  FinancialId: 4,
  Section: "capital",
  Description: "Networking",
  CostCategory: null,
  FundingSource: null,
  Supplier: null,
  GlAccount: null,
  FinancialTaxProfileId: 1,
  IsRecurrent: false,
  Comments: null,
  SortOrder: 1,
  Amounts: '[{"fiscalYear":2023,"amount":9000.00}]',
  RowVer: "15",
};

const savedTx = {
  FinancialTransactionId: 3,
  FinancialLineId: 8,
  FinancialId: 4,
  FiscalYear: 2023,
  TransactionDate: "2024-03-31",
  Reference: "F-1",
  Description: null,
  Amount: 5000,
  TaxRate: 0.056879,
  RowVer: "16",
};

describe("financials repository", () => {
  beforeEach(() => {
    execProc.mockReset();
    execProcSets.mockReset();
  });

  it("lists with the ADR-0016 parameters", async () => {
    execProc.mockResolvedValue([
      {
        FinancialId: 4,
        ProjectId: 2,
        Title: "B",
        TemplateName: null,
        ProjectNumber: null,
        BudgetEnvelope: null,
        Budget: null,
        RecurrentFees: null,
        ContractTimeframe: null,
        FirstFiscalYear: 2023,
        HorizonYears: 5,
        FiscalYearStartMonth: 4,
        CurrencyCode: "",
        LineCount: 3,
        DocumentCount: 9,
        DocumentsRequired: 4,
        DocumentsNotRequired: 3,
        DocumentsUndecided: 2,
        DocumentsRequiredWithFile: 1,
        CreatedAtUtc: new Date(),
        UpdatedAtUtc: null,
        RowVer: "1",
        TotalCount: 1,
        ActorAccess: "Manager",
        ActorGrants: null,
        ActorRevokes: null,
      },
    ]);
    const rows = await listFinancials(listParamsSchema.parse({ q: "b" }), 7, 2);
    expect(rows[0]!.LineCount).toBe(3);
    expect(execProc).toHaveBeenCalledWith(
      "usp_Financial_List",
      expect.objectContaining({ ActorUserId: 7, ProjectId: 2, Search: "b" }),
    );
  });

  it("reads a sheet from five result sets", async () => {
    execProcSets.mockResolvedValue(workbookSheetSets());
    const sheet = await getFinancialSheet(4, 7);
    expect(sheet.lines).toHaveLength(5);
    expect(execProcSets).toHaveBeenCalledWith("usp_Financial_GetSheet", {
      FinancialId: 4,
      ActorUserId: 7,
    });
  });

  it("creates, updates and deletes financials with canonical text", async () => {
    execProc.mockResolvedValue([financialRow()]);
    await createFinancial(
      createFinancialInput.parse({
        projectId: 2,
        title: " B ",
        templateId: 1,
        firstFiscalYear: 2023,
      }),
      7,
    );
    expect(execProc).toHaveBeenLastCalledWith("usp_Financial_Create", {
      ProjectId: 2,
      Title: "B",
      FinancialTemplateId: 1,
      FirstFiscalYear: 2023,
      ActorUserId: 7,
    });
    const saved = await updateFinancial(
      updateFinancialInput.parse({
        financialId: 4,
        title: "B",
        budget: "100,000",
        firstFiscalYear: 2023,
        horizonYears: 5,
        startMonth: 4,
        escalationRate: "5",
        flagThresholdRate: "10",
        costCategories: ["A"],
        fundingSources: [],
        currency: "eur",
        rowVer: 77,
      }),
      7,
    );
    expect(saved.rowVer).toBe(77);
    expect(execProc).toHaveBeenLastCalledWith(
      "usp_Financial_Update",
      expect.objectContaining({
        Budget: "100000.00",
        EscalationRate: "0.050000",
        CostCategories: '["A"]',
        ProjectNumber: null,
        CurrencyCode: "EUR",
        RowVer: 77,
      }),
    );
    await setTaxProfiles(
      setTaxProfilesInput.parse({
        financialId: 4,
        rowVer: 77,
        profiles: [
          { id: 1, name: "Net", rate: "5.6879" },
          { name: "New", rate: "1" },
        ],
      }),
      7,
    );
    expect(execProc).toHaveBeenLastCalledWith("usp_FinancialTaxProfile_Set", {
      FinancialId: 4,
      ProfilesJson:
        '[{"id":1,"name":"Net","rate":"0.056879","steps":[]},{"id":null,"name":"New","rate":"0.010000","steps":[]}]',
      RowVer: 77,
      ActorUserId: 7,
    });
    execProc.mockResolvedValue([]);
    await deleteFinancial(4, 77, 7);
    expect(execProc).toHaveBeenLastCalledWith("usp_Financial_Delete", {
      FinancialId: 4,
      RowVer: 77,
      ActorUserId: 7,
    });
  });

  it("writes lines without a client project or financial on update", async () => {
    execProc.mockResolvedValue([savedLine]);
    await createLine(
      createLineInput.parse({
        financialId: 4,
        section: "capital",
        description: "Networking",
        taxProfileId: 1,
        amounts: [{ fiscalYear: 2023, amount: "9000" }],
      }),
      7,
    );
    expect(execProc).toHaveBeenLastCalledWith(
      "usp_FinancialLine_Create",
      expect.objectContaining({
        FinancialId: 4,
        AmountsJson: '[{"fiscalYear":2023,"amount":"9000.00"}]',
        FinancialTaxProfileId: 1,
      }),
    );
    await updateLine(
      updateLineInput.parse({
        lineId: 8,
        section: "capital",
        description: "N",
        amounts: [],
        rowVer: 15,
      }),
      7,
    );
    const [, params] = execProc.mock.lastCall as [string, Record<string, unknown>];
    expect(params).not.toHaveProperty("FinancialId");
    expect(params).toMatchObject({ FinancialLineId: 8, AmountsJson: "[]", RowVer: 15 });
    await moveLine(8, "up", 15, 7);
    expect(execProc).toHaveBeenLastCalledWith("usp_FinancialLine_Move", {
      FinancialLineId: 8,
      Direction: "up",
      RowVer: 15,
      ActorUserId: 7,
    });
    execProc.mockResolvedValue([]);
    await deleteLine(8, 15, 7);
    expect(execProc).toHaveBeenLastCalledWith("usp_FinancialLine_Delete", {
      FinancialLineId: 8,
      RowVer: 15,
      ActorUserId: 7,
    });
  });

  it("writes transactions without a tax rate", async () => {
    execProc.mockResolvedValue([savedTx]);
    await createTransaction(
      createTransactionInput.parse({
        lineId: 8,
        date: "2024-03-31",
        amount: "5,000",
        reference: "F-1",
      }),
      7,
    );
    const [, params] = execProc.mock.lastCall as [string, Record<string, unknown>];
    expect(params).toEqual({
      FinancialLineId: 8,
      TransactionDate: "2024-03-31",
      FiscalYear: null,
      Reference: "F-1",
      Description: null,
      Amount: "5000.00",
      ActorUserId: 7,
    });
    await updateTransaction(
      updateTransactionInput.parse({
        transactionId: 3,
        lineId: 8,
        date: "2024-03-31",
        amount: "-1",
        fiscalYear: 2023,
        rowVer: 16,
      }),
      7,
    );
    expect(execProc).toHaveBeenLastCalledWith(
      "usp_FinancialTransaction_Update",
      expect.objectContaining({
        FinancialTransactionId: 3,
        Amount: "-1.00",
        FiscalYear: 2023,
        RowVer: 16,
      }),
    );
    execProc.mockResolvedValue([]);
    await deleteTransaction(3, 16, 7);
    expect(execProc).toHaveBeenLastCalledWith("usp_FinancialTransaction_Delete", {
      FinancialTransactionId: 3,
      RowVer: 16,
      ActorUserId: 7,
    });
  });
});

describe("templates repository", () => {
  beforeEach(() => execProc.mockReset());

  it("lists, reads, saves and deletes", async () => {
    execProc.mockResolvedValue([templateRow()]);
    expect((await listTemplates(7))[0]!.definition.taxProfiles).toHaveLength(2);
    expect((await getTemplate(1, 7)).name).toBe("Standard");
    await saveTemplate(
      saveTemplateInput.parse({
        name: "Copy",
        isDefault: false,
        definition: {
          horizonYears: 3,
          fiscalYearStartMonth: 4,
          escalationRate: "5",
          flagThresholdRate: "10",
          taxProfiles: [{ key: "t1", name: "Net", rate: "5.6879" }],
          costCategories: [],
          fundingSources: [],
          lines: [{ section: "operating", description: "PM", taxProfileKey: "t1", amount: "350" }],
        },
      }),
      7,
    );
    const [, params] = execProc.mock.lastCall as [string, Record<string, unknown>];
    expect(params).toMatchObject({
      FinancialTemplateId: null,
      Name: "Copy",
      IsDefault: false,
      RowVer: null,
      ActorUserId: 7,
    });
    expect(JSON.parse(params.Definition as string)).toMatchObject({
      escalationRate: "0.050000",
      taxProfiles: [{ rate: "0.056879", isDefault: false }],
      lines: [{ amount: "350.00", costCategory: null }],
    });
    execProc.mockResolvedValue([]);
    await deleteTemplate(1, 9, 7);
    expect(execProc).toHaveBeenLastCalledWith("usp_FinancialTemplate_Delete", {
      FinancialTemplateId: 1,
      RowVer: 9,
      ActorUserId: 7,
    });
  });
});
