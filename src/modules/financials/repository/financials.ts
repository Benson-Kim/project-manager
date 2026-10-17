import type { z } from "zod";
import { execProc, execProcSets } from "@/lib/db";
import { DEFAULT_PAGE_SIZE, toProcListParams, type ListParams } from "@/lib/list-params";
import {
  financialListRowSchema,
  financialRowSchema,
  savedLineRowSchema,
  toFinancialDto,
  toSheetDto,
  transactionRowSchema,
  type createFinancialInput,
  type createLineInput,
  type createTransactionInput,
  type FinancialDto,
  type FinancialListRow,
  type setTaxProfilesInput,
  type SheetDto,
  type updateFinancialInput,
  type updateLineInput,
  type updateTransactionInput,
} from "../schemas/financial";

/**
 * Project financials (ADR-0029) — stored procedures only. Every write resolves
 * the project from the row it touches inside the proc; callers never pass a
 * project for a line or a transaction. Amounts and rates go to SQL as the
 * canonical text the schemas produce: writes take the actions' parsed input
 * (the transforms are not idempotent, so nothing parses twice).
 */

export async function listFinancials(
  params: ListParams,
  actorUserId: number,
  projectId: number | null = null,
  pageSize: number = DEFAULT_PAGE_SIZE,
): Promise<FinancialListRow[]> {
  const rows = await execProc<FinancialListRow>("usp_Financial_List", {
    ActorUserId: actorUserId,
    ProjectId: projectId,
    ...toProcListParams(params, pageSize),
  });
  return rows.map((r) => financialListRowSchema.parse(r));
}

export async function getFinancialSheet(
  financialId: number,
  actorUserId: number,
): Promise<SheetDto> {
  const sets = await execProcSets("usp_Financial_GetSheet", {
    FinancialId: financialId,
    ActorUserId: actorUserId,
  });
  return toSheetDto(sets);
}

export async function createFinancial(
  parsed: z.output<typeof createFinancialInput>,
  actorUserId: number,
): Promise<FinancialDto> {
  const rows = await execProc("usp_Financial_Create", {
    ProjectId: parsed.projectId,
    Title: parsed.title,
    FinancialTemplateId: parsed.templateId,
    FirstFiscalYear: parsed.firstFiscalYear,
    ActorUserId: actorUserId,
  });
  return toFinancialDto(financialRowSchema.parse(rows[0]));
}

export async function updateFinancial(
  p: z.output<typeof updateFinancialInput>,
  actorUserId: number,
): Promise<FinancialDto> {
  const rows = await execProc("usp_Financial_Update", {
    FinancialId: p.financialId,
    Title: p.title,
    ProjectNumber: p.projectNumber,
    Acquisition: p.acquisition,
    GlGrandLivre: p.glGrandLivre,
    BudgetEnvelope: p.budgetEnvelope,
    Budget: p.budget,
    BudgetIncludesTax: p.budgetIncludesTax,
    SpendBy: p.spendBy,
    RecurrentFees: p.recurrentFees,
    ContractTimeframe: p.contractTimeframe,
    FirstFiscalYear: p.firstFiscalYear,
    HorizonYears: p.horizonYears,
    FiscalYearStartMonth: p.startMonth,
    EscalationRate: p.escalationRate,
    FlagThresholdRate: p.flagThresholdRate,
    CostCategories: JSON.stringify(p.costCategories),
    FundingSources: JSON.stringify(p.fundingSources),
    RowVer: p.rowVer,
    ActorUserId: actorUserId,
  });
  return toFinancialDto(financialRowSchema.parse(rows[0]));
}

export async function setTaxProfiles(
  p: z.output<typeof setTaxProfilesInput>,
  actorUserId: number,
): Promise<FinancialDto> {
  const rows = await execProc("usp_FinancialTaxProfile_Set", {
    FinancialId: p.financialId,
    ProfilesJson: JSON.stringify(
      p.profiles.map(({ id, name, rate, steps }) => ({
        id,
        name,
        rate,
        steps: steps.map(({ fromFiscalYear, rate: stepRate }) => ({
          fromFiscalYear,
          rate: stepRate,
        })),
      })),
    ),
    RowVer: p.rowVer,
    ActorUserId: actorUserId,
  });
  return toFinancialDto(financialRowSchema.parse(rows[0]));
}

export async function deleteFinancial(
  financialId: number,
  rowVer: number,
  actorUserId: number,
): Promise<void> {
  await execProc("usp_Financial_Delete", {
    FinancialId: financialId,
    RowVer: rowVer,
    ActorUserId: actorUserId,
  });
}

type LineFields = Omit<z.output<typeof createLineInput>, "financialId">;

function lineParams(p: LineFields) {
  return {
    Section: p.section,
    Description: p.description,
    CostCategory: p.costCategory,
    FundingSource: p.fundingSource,
    Supplier: p.supplier,
    GlAccount: p.glAccount,
    FinancialTaxProfileId: p.taxProfileId,
    IsRecurrent: p.isRecurrent,
    Comments: p.comments,
    AmountsJson: JSON.stringify(
      p.amounts.map(({ fiscalYear, amount }) => ({ fiscalYear, amount })),
    ),
  };
}

export async function createLine(p: z.output<typeof createLineInput>, actorUserId: number) {
  const rows = await execProc("usp_FinancialLine_Create", {
    FinancialId: p.financialId,
    ...lineParams(p),
    ActorUserId: actorUserId,
  });
  return savedLineRowSchema.parse(rows[0]);
}

export async function updateLine(p: z.output<typeof updateLineInput>, actorUserId: number) {
  const rows = await execProc("usp_FinancialLine_Update", {
    FinancialLineId: p.lineId,
    ...lineParams(p),
    RowVer: p.rowVer,
    ActorUserId: actorUserId,
  });
  return savedLineRowSchema.parse(rows[0]);
}

export async function moveLine(
  lineId: number,
  direction: "up" | "down",
  rowVer: number,
  actorUserId: number,
) {
  const rows = await execProc("usp_FinancialLine_Move", {
    FinancialLineId: lineId,
    Direction: direction,
    RowVer: rowVer,
    ActorUserId: actorUserId,
  });
  return savedLineRowSchema.parse(rows[0]);
}

export async function deleteLine(
  lineId: number,
  rowVer: number,
  actorUserId: number,
): Promise<void> {
  await execProc("usp_FinancialLine_Delete", {
    FinancialLineId: lineId,
    RowVer: rowVer,
    ActorUserId: actorUserId,
  });
}

function transactionParams(p: z.output<typeof createTransactionInput>) {
  return {
    FinancialLineId: p.lineId,
    TransactionDate: p.date,
    FiscalYear: p.fiscalYear,
    Reference: p.reference,
    Description: p.description,
    Amount: p.amount,
  };
}

export async function createTransaction(
  p: z.output<typeof createTransactionInput>,
  actorUserId: number,
) {
  const rows = await execProc("usp_FinancialTransaction_Create", {
    ...transactionParams(p),
    ActorUserId: actorUserId,
  });
  return transactionRowSchema.parse(rows[0]);
}

export async function updateTransaction(
  p: z.output<typeof updateTransactionInput>,
  actorUserId: number,
) {
  const rows = await execProc("usp_FinancialTransaction_Update", {
    FinancialTransactionId: p.transactionId,
    ...transactionParams(p),
    RowVer: p.rowVer,
    ActorUserId: actorUserId,
  });
  return transactionRowSchema.parse(rows[0]);
}

export async function deleteTransaction(
  transactionId: number,
  rowVer: number,
  actorUserId: number,
): Promise<void> {
  await execProc("usp_FinancialTransaction_Delete", {
    FinancialTransactionId: transactionId,
    RowVer: rowVer,
    ActorUserId: actorUserId,
  });
}
