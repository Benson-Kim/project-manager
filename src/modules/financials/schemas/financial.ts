import { z } from "zod";
import { actorAccessFields } from "@/lib/auth/actor-access";
import { messages } from "@/lib/messages";
import type { AttachmentRow } from "@/modules/file-storage/schemas/attachment";
import { rowVerSchema } from "@/modules/projects/schemas/project";
import { centsFromDb, centsToDecimal, microsFromDb, microsToFraction } from "../calc/money";
import { toDocumentDto, toDocumentFiles, type DocumentDto } from "./documents";
import {
  budgetAmountText,
  fiscalYearSchema,
  horizonSchema,
  labelListSchema,
  optionalBudgetAmountText,
  optionalText,
  percentText,
  sectionSchema,
  startMonthSchema,
  transactionAmountText,
} from "./fields";

/**
 * Project financials (ADR-0029): row schemas mirror the procs' SELECT shapes;
 * the Dto types are what pages pass to client components. Amounts and rates
 * leave the server as exact decimal text (the driver returns DECIMAL as a
 * float), never as numbers.
 */

const M = messages.financials;

const decimal = z.union([z.number(), z.string()]);
const money = (v: number | string) => centsToDecimal(centsFromDb(v));
const fraction = (v: number | string) => microsToFraction(microsFromDb(v));

const labelsJson = z
  .string()
  .transform((text) => labelListSchema.catch([]).parse(JSON.parse(text)));

export const financialRowSchema = z.object({
  FinancialId: z.number().int(),
  ProjectId: z.number().int(),
  Title: z.string().nullable(),
  TemplateName: z.string().nullable(),
  ProjectNumber: z.number().int().nullable(),
  Acquisition: z.string().nullable(),
  GlGrandLivre: z.string().nullable(),
  BudgetEnvelope: z.string().nullable(),
  Budget: decimal.nullable(),
  BudgetIncludesTax: z.boolean(),
  SpendBy: z.string().nullable(),
  RecurrentFees: decimal.nullable(),
  ContractTimeframe: z.string().nullable(),
  FirstFiscalYear: z.number().int(),
  HorizonYears: z.number().int(),
  FiscalYearStartMonth: z.number().int(),
  EscalationRate: decimal,
  FlagThresholdRate: decimal,
  CostCategories: labelsJson,
  FundingSources: labelsJson,
  CreatedAtUtc: z.date(),
  UpdatedAtUtc: z.date().nullable(),
  RowVer: rowVerSchema,
});

export type FinancialRow = z.infer<typeof financialRowSchema>;

export interface FinancialDto {
  id: number;
  projectId: number;
  title: string;
  templateName: string | null;
  projectNumber: number | null;
  acquisition: string | null;
  glGrandLivre: string | null;
  budgetEnvelope: string | null;
  budget: string | null;
  /** Whether the authorised budget is tax included (else before tax). */
  budgetIncludesTax: boolean;
  spendBy: string | null;
  recurrentFees: string | null;
  contractTimeframe: string | null;
  firstFiscalYear: number;
  horizonYears: number;
  startMonth: number;
  escalationRate: string;
  flagThresholdRate: string;
  costCategories: string[];
  fundingSources: string[];
  rowVer: number;
}

export function toFinancialDto(row: FinancialRow): FinancialDto {
  return {
    id: row.FinancialId,
    projectId: row.ProjectId,
    title: row.Title ?? "",
    templateName: row.TemplateName,
    projectNumber: row.ProjectNumber,
    acquisition: row.Acquisition,
    glGrandLivre: row.GlGrandLivre,
    budgetEnvelope: row.BudgetEnvelope,
    budget: row.Budget === null ? null : money(row.Budget),
    budgetIncludesTax: row.BudgetIncludesTax,
    spendBy: row.SpendBy,
    recurrentFees: row.RecurrentFees === null ? null : money(row.RecurrentFees),
    contractTimeframe: row.ContractTimeframe,
    firstFiscalYear: row.FirstFiscalYear,
    horizonYears: row.HorizonYears,
    startMonth: row.FiscalYearStartMonth,
    escalationRate: fraction(row.EscalationRate),
    flagThresholdRate: fraction(row.FlagThresholdRate),
    costCategories: row.CostCategories,
    fundingSources: row.FundingSources,
    rowVer: row.RowVer,
  };
}

export const financialListRowSchema = z.object({
  FinancialId: z.number().int(),
  ProjectId: z.number().int(),
  Title: z.string().nullable(),
  TemplateName: z.string().nullable(),
  ProjectNumber: z.number().int().nullable(),
  BudgetEnvelope: z.string().nullable(),
  Budget: decimal.nullable(),
  RecurrentFees: decimal.nullable(),
  ContractTimeframe: z.string().nullable(),
  FirstFiscalYear: z.number().int(),
  HorizonYears: z.number().int(),
  FiscalYearStartMonth: z.number().int(),
  LineCount: z.number().int(),
  DocumentCount: z.number().int(),
  DocumentsRequired: z.number().int(),
  DocumentsNotRequired: z.number().int(),
  DocumentsUndecided: z.number().int(),
  DocumentsRequiredWithFile: z.number().int(),
  CreatedAtUtc: z.date(),
  UpdatedAtUtc: z.date().nullable(),
  RowVer: rowVerSchema,
  TotalCount: z.number().int(),
  ...actorAccessFields,
});

export type FinancialListRow = z.infer<typeof financialListRowSchema>;

export const taxProfileRowSchema = z.object({
  FinancialTaxProfileId: z.number().int(),
  Name: z.string(),
  Rate: decimal,
  SortOrder: z.number().int(),
  Steps: z.string(),
  RowVer: rowVerSchema,
});

const stepsJson = z.array(z.object({ fromFiscalYear: z.number().int(), rate: decimal }));

export interface TaxProfileDto {
  id: number;
  name: string;
  rate: string;
  /** Rate changes from a fiscal year on, earliest first. */
  steps: { fromFiscalYear: number; rate: string }[];
}

export const lineRowSchema = z.object({
  FinancialLineId: z.number().int(),
  Section: sectionSchema,
  Description: z.string(),
  CostCategory: z.string().nullable(),
  FundingSource: z.string().nullable(),
  Supplier: z.string().nullable(),
  GlAccount: z.string().nullable(),
  FinancialTaxProfileId: z.number().int().nullable(),
  IsRecurrent: z.boolean(),
  Comments: z.string().nullable(),
  SortOrder: z.number().int(),
  RowVer: rowVerSchema,
});

/** A line as a write proc returns it: its amounts as JSON (dbo.ufn_FinancialLine_Row). */
export const savedLineRowSchema = lineRowSchema.extend({
  FinancialId: z.number().int(),
  Amounts: z.string(),
});

export const amountRowSchema = z.object({
  FinancialLineId: z.number().int(),
  FiscalYear: z.number().int(),
  Amount: decimal,
});

export interface LineDto {
  id: number;
  section: z.infer<typeof sectionSchema>;
  description: string;
  costCategory: string | null;
  fundingSource: string | null;
  supplier: string | null;
  glAccount: string | null;
  taxProfileId: number | null;
  isRecurrent: boolean;
  comments: string | null;
  /** Typed pre-tax amounts, fiscal year -> "1234.50". */
  amounts: Record<number, string>;
  rowVer: number;
}

export const transactionRowSchema = z.object({
  FinancialTransactionId: z.number().int(),
  FinancialLineId: z.number().int(),
  FiscalYear: z.number().int(),
  TransactionDate: z.string(),
  Reference: z.string().nullable(),
  Description: z.string().nullable(),
  Amount: decimal,
  TaxRate: decimal,
  RowVer: rowVerSchema,
});

export interface TransactionDto {
  id: number;
  lineId: number;
  fiscalYear: number;
  date: string;
  reference: string | null;
  description: string | null;
  amount: string;
  taxRate: string;
  rowVer: number;
}

export interface SheetDto {
  financial: FinancialDto;
  profiles: TaxProfileDto[];
  lines: LineDto[];
  transactions: TransactionDto[];
  /** The document checklist in its order (ADR-0030). */
  documents: DocumentDto[];
  /** Attachments of those documents, by document id. */
  documentFiles: Record<number, AttachmentRow[]>;
}

export function toSheetDto(sets: unknown[][]): SheetDto {
  const [
    financialRows = [],
    profileRows = [],
    lineRows = [],
    amountRows = [],
    transactionRows = [],
    documentRows = [],
    documentFileRows = [],
  ] = sets;
  const amounts = new Map<number, Record<number, string>>();
  for (const raw of amountRows) {
    const a = amountRowSchema.parse(raw);
    const forLine = amounts.get(a.FinancialLineId) ?? {};
    forLine[a.FiscalYear] = money(a.Amount);
    amounts.set(a.FinancialLineId, forLine);
  }
  return {
    financial: toFinancialDto(financialRowSchema.parse(financialRows[0])),
    profiles: profileRows.map((raw) => {
      const p = taxProfileRowSchema.parse(raw);
      return {
        id: p.FinancialTaxProfileId,
        name: p.Name,
        rate: fraction(p.Rate),
        steps: stepsJson
          .parse(JSON.parse(p.Steps))
          .map((s) => ({ fromFiscalYear: s.fromFiscalYear, rate: fraction(s.rate) })),
      };
    }),
    lines: lineRows.map((raw) => {
      const l = lineRowSchema.parse(raw);
      return {
        id: l.FinancialLineId,
        section: l.Section,
        description: l.Description,
        costCategory: l.CostCategory,
        fundingSource: l.FundingSource,
        supplier: l.Supplier,
        glAccount: l.GlAccount,
        taxProfileId: l.FinancialTaxProfileId,
        isRecurrent: l.IsRecurrent,
        comments: l.Comments,
        amounts: amounts.get(l.FinancialLineId) ?? {},
        rowVer: l.RowVer,
      };
    }),
    transactions: transactionRows.map((raw) => {
      const t = transactionRowSchema.parse(raw);
      return {
        id: t.FinancialTransactionId,
        lineId: t.FinancialLineId,
        fiscalYear: t.FiscalYear,
        date: t.TransactionDate,
        reference: t.Reference,
        description: t.Description,
        amount: money(t.Amount),
        taxRate: fraction(t.TaxRate),
        rowVer: t.RowVer,
      };
    }),
    documents: documentRows.map(toDocumentDto),
    documentFiles: toDocumentFiles(documentFileRows),
  };
}

// ── Inputs ───────────────────────────────────────────────────────────────────

const id = z.coerce.number().int().positive();

/** An id that may be left blank: "" and null mean none (checked before coercion, which reads "" as 0). */
const optionalId = z
  .union([z.literal(""), z.null(), id])
  .optional()
  .transform((v) => (typeof v === "number" ? v : null));

export const createFinancialInput = z.object({
  projectId: id,
  title: z.string().trim().min(1, M.titleRequired).max(150),
  templateId: optionalId,
  firstFiscalYear: fiscalYearSchema,
});

export type CreateFinancialInput = z.input<typeof createFinancialInput>;

export const updateFinancialInput = z.object({
  financialId: id,
  title: z.string().trim().min(1, M.titleRequired).max(150),
  projectNumber: z
    .union([z.literal(""), z.null(), z.coerce.number().int().nonnegative().max(2147483647)])
    .optional()
    .transform((v) => (typeof v === "number" ? v : null)),
  acquisition: optionalText(255),
  glGrandLivre: optionalText(255),
  budgetEnvelope: optionalText(255),
  budget: optionalBudgetAmountText,
  budgetIncludesTax: z.boolean().default(true),
  spendBy: optionalText(255),
  recurrentFees: optionalBudgetAmountText,
  contractTimeframe: optionalText(255),
  firstFiscalYear: fiscalYearSchema,
  horizonYears: horizonSchema,
  startMonth: startMonthSchema,
  escalationRate: percentText,
  flagThresholdRate: percentText,
  costCategories: labelListSchema,
  fundingSources: labelListSchema,
  rowVer: rowVerSchema,
});

export type UpdateFinancialInput = z.input<typeof updateFinancialInput>;

export const setTaxProfilesInput = z.object({
  financialId: id,
  profiles: z
    .array(
      z.object({
        id: optionalId,
        name: z.string().trim().min(1, M.profileName).max(100),
        rate: percentText,
        steps: z
          .array(z.object({ fromFiscalYear: fiscalYearSchema, rate: percentText }))
          .max(10)
          .default([])
          .refine(
            (steps) => new Set(steps.map((s) => s.fromFiscalYear)).size === steps.length,
            M.stepYearDuplicate,
          ),
      }),
    )
    .max(20)
    .refine((list) => new Set(list.map((p) => p.name)).size === list.length, M.profilesDuplicate),
  rowVer: rowVerSchema,
});

export type SetTaxProfilesInput = z.input<typeof setTaxProfilesInput>;

export const deleteFinancialInput = z.object({ financialId: id, rowVer: rowVerSchema });

const lineFields = {
  section: sectionSchema,
  description: z.string().trim().min(1, M.descriptionRequired).max(255),
  costCategory: optionalText(150),
  fundingSource: optionalText(150),
  supplier: optionalText(255),
  glAccount: optionalText(100),
  taxProfileId: optionalId,
  isRecurrent: z.boolean().default(false),
  comments: optionalText(1000),
  amounts: z
    .array(z.object({ fiscalYear: fiscalYearSchema, amount: budgetAmountText }))
    .max(7)
    .refine((list) => new Set(list.map((a) => a.fiscalYear)).size === list.length, M.yearOutside),
};

export const createLineInput = z.object({ financialId: id, ...lineFields });
export type CreateLineInput = z.input<typeof createLineInput>;

export const updateLineInput = z.object({ lineId: id, ...lineFields, rowVer: rowVerSchema });
export type UpdateLineInput = z.input<typeof updateLineInput>;

export const deleteLineInput = z.object({ lineId: id, rowVer: rowVerSchema });

export const moveLineInput = z.object({
  lineId: id,
  direction: z.enum(["up", "down"]),
  rowVer: rowVerSchema,
});

const transactionFields = {
  lineId: id,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, M.date),
  fiscalYear: z
    .union([z.literal(""), z.null(), fiscalYearSchema])
    .optional()
    .transform((v) => (typeof v === "number" ? v : null)),
  reference: optionalText(100),
  description: optionalText(255),
  amount: transactionAmountText,
};

export const createTransactionInput = z.object(transactionFields);
export type CreateTransactionInput = z.input<typeof createTransactionInput>;

export const updateTransactionInput = z.object({
  transactionId: id,
  ...transactionFields,
  rowVer: rowVerSchema,
});
export type UpdateTransactionInput = z.input<typeof updateTransactionInput>;

export const deleteTransactionInput = z.object({ transactionId: id, rowVer: rowVerSchema });
