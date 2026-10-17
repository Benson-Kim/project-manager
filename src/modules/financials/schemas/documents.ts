import { z } from "zod";
import { messages } from "@/lib/messages";
import { rowVerSchema } from "@/modules/projects/schemas/project";
import { attachmentRowSchema, type AttachmentRow } from "@/modules/file-storage/schemas/attachment";
import { budgetAmountText, optionalText, storedAmountText } from "./fields";

/**
 * The document checklist of a financial (ADR-0030): its own list of MSSS
 * documents, each required, not required or not decided yet, with a reason for
 * not creating it (never enforced) and advisory suggestion rules that offer a
 * reason from the budget. Templates carry a list that new financials copy.
 * dbo.usp_FinancialDocument_AssertSuggestions and
 * dbo.usp_FinancialTemplate_AssertDefinition check the same rules in SQL.
 */

const M = messages.financials.documents;

export const DOCUMENT_LIMITS = { perFinancial: 50, name: 200, reason: 2000 } as const;

export const SUGGESTION_KINDS = ["budgetBelow", "noCapital"] as const;
export type SuggestionKind = (typeof SUGGESTION_KINDS)[number];

const reasonText = z.string().trim().min(1, M.reason).max(DOCUMENT_LIMITS.reason, M.reasonTooLong);

/** A stored suggestion rule, as kept in a template document or app.FinancialDocument.Suggestions. */
export const suggestionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("budgetBelow"),
    amount: storedAmountText.refine((v) => !/^0+(\.0+)?$/.test(v), messages.financials.amountZero),
    reason: reasonText,
  }),
  z.object({ kind: z.literal("noCapital"), reason: reasonText }),
]);

export type Suggestion = z.infer<typeof suggestionSchema>;

function uniqueKinds(list: { kind: string }[], ctx: z.RefinementCtx) {
  if (new Set(list.map((s) => s.kind)).size !== list.length) {
    ctx.addIssue({ code: "custom", message: M.suggestionKindDuplicate });
  }
}

export const suggestionListSchema = z.array(suggestionSchema).max(2).superRefine(uniqueKinds);

/** A suggestion as typed in an editor: the amount as people write it ("200,000"). */
export const suggestionInput = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("budgetBelow"),
    amount: budgetAmountText.refine((v) => v !== "0.00", messages.financials.amountZero),
    reason: reasonText,
  }),
  z.object({ kind: z.literal("noCapital"), reason: reasonText }),
]);

export const suggestionListInput = z.array(suggestionInput).max(2).superRefine(uniqueKinds);

/** Required, not required, or not decided yet (null). */
export const requiredSchema = z.boolean().nullable();

/** Names compare as SQL Server does (case-insensitive collation), so zod and the procs agree. */
export const documentNameKey = (name: string) => name.trim().toLocaleLowerCase("fr-CA");

function uniqueNames(list: { name: string }[], ctx: z.RefinementCtx) {
  if (new Set(list.map((d) => documentNameKey(d.name))).size !== list.length) {
    ctx.addIssue({ code: "custom", message: M.nameDuplicate });
  }
}

/** A template's document, stored form. Older templates have no documents at all. */
export const templateDocumentSchema = z.object({
  name: z.string().trim().min(1).max(DOCUMENT_LIMITS.name),
  required: requiredSchema.default(null),
  reason: z.string().trim().max(DOCUMENT_LIMITS.reason).nullable().default(null),
  suggestions: suggestionListSchema.default([]),
});

export const templateDocumentListSchema = z
  .array(templateDocumentSchema)
  .max(DOCUMENT_LIMITS.perFinancial)
  .superRefine(uniqueNames)
  .default([]);

/** A template's document as the editor sends it. */
export const templateDocumentInput = z.object({
  name: z.string().trim().min(1, M.nameRequired).max(DOCUMENT_LIMITS.name),
  required: requiredSchema.default(null),
  reason: optionalText(DOCUMENT_LIMITS.reason),
  suggestions: suggestionListInput.default([]),
});

export const templateDocumentListInput = z
  .array(templateDocumentInput)
  .max(DOCUMENT_LIMITS.perFinancial, M.tooMany)
  .superRefine(uniqueNames)
  .default([]);

// ── A financial's checklist ──────────────────────────────────────────────────

export const documentRowSchema = z.object({
  FinancialDocumentId: z.number().int(),
  Name: z.string(),
  IsRequired: z.boolean().nullable(),
  ReasonNotCreated: z.string().nullable(),
  Suggestions: z.string(),
  SortOrder: z.number().int(),
  FileCount: z.number().int(),
  RowVer: rowVerSchema,
});

/** A document row as a write proc returns it (dbo.ufn_FinancialDocument_Row). */
export const savedDocumentRowSchema = documentRowSchema.extend({ FinancialId: z.number().int() });

export const documentFileRowSchema = attachmentRowSchema.extend({
  FinancialDocumentId: z.number().int(),
});

export interface DocumentDto {
  id: number;
  name: string;
  required: boolean | null;
  reason: string | null;
  suggestions: Suggestion[];
  fileCount: number;
  rowVer: number;
}

/** Stored suggestions that no longer parse are dropped, never shown half-read. */
function parseSuggestions(text: string): Suggestion[] {
  try {
    return suggestionListSchema.catch([]).parse(JSON.parse(text));
  } catch {
    return [];
  }
}

export function toDocumentDto(raw: unknown): DocumentDto {
  const d = documentRowSchema.parse(raw);
  return {
    id: d.FinancialDocumentId,
    name: d.Name,
    required: d.IsRequired,
    reason: d.ReasonNotCreated,
    suggestions: parseSuggestions(d.Suggestions),
    fileCount: d.FileCount,
    rowVer: d.RowVer,
  };
}

/** Attachments of the financial's documents, by document id. */
export function toDocumentFiles(rows: unknown[]): Record<number, AttachmentRow[]> {
  const byDocument: Record<number, AttachmentRow[]> = {};
  for (const raw of rows) {
    const { FinancialDocumentId, ...file } = documentFileRowSchema.parse(raw);
    (byDocument[FinancialDocumentId] ??= []).push(file);
  }
  return byDocument;
}

// ── Inputs ───────────────────────────────────────────────────────────────────

const id = z.coerce.number().int().positive();

const documentFields = {
  name: z.string().trim().min(1, M.nameRequired).max(DOCUMENT_LIMITS.name),
  required: requiredSchema,
  reason: optionalText(DOCUMENT_LIMITS.reason),
  suggestions: suggestionListInput.default([]),
};

export const createDocumentInput = z.object({ financialId: id, ...documentFields });
export type CreateDocumentInput = z.input<typeof createDocumentInput>;

export const updateDocumentInput = z.object({
  documentId: id,
  ...documentFields,
  rowVer: rowVerSchema,
});
export type UpdateDocumentInput = z.input<typeof updateDocumentInput>;

export const deleteDocumentInput = z.object({ documentId: id, rowVer: rowVerSchema });

export const moveDocumentInput = z.object({
  documentId: id,
  direction: z.enum(["up", "down"]),
  rowVer: rowVerSchema,
});

export const copyDocumentsInput = z.object({ financialId: id, templateId: id });
