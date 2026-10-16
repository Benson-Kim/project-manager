"use server";

import { action } from "@/lib/action";
import {
  createFinancial,
  createLine,
  createTransaction,
  deleteFinancial,
  deleteLine,
  deleteTransaction,
  moveLine,
  setTaxProfiles,
  updateFinancial,
  updateLine,
  updateTransaction,
} from "../repository/financials";
import {
  copyDocumentsFromTemplate,
  createDocument,
  deleteDocument,
  moveDocument,
  updateDocument,
} from "../repository/documents";
import { deleteTemplate, saveTemplate } from "../repository/templates";
import {
  copyDocumentsInput,
  createDocumentInput,
  deleteDocumentInput,
  moveDocumentInput,
  updateDocumentInput,
} from "../schemas/documents";
import {
  createFinancialInput,
  createLineInput,
  createTransactionInput,
  deleteFinancialInput,
  deleteLineInput,
  deleteTransactionInput,
  moveLineInput,
  setTaxProfilesInput,
  updateFinancialInput,
  updateLineInput,
  updateTransactionInput,
} from "../schemas/financial";
import { deleteTemplateInput, saveTemplateInput } from "../schemas/template";

/**
 * Financials calculator actions (ADR-0029). Project financials: Viewers read,
 * Managers write (not a Contributor module), and a Manager can grant or revoke
 * create / update / delete per person (ADR-0024) — all enforced in the procs
 * (FORBIDDEN_ROW). Tax profiles and invoices are their own section,
 * "financial-tax-invoices", so a grant to edit budget lines never includes
 * re-rating taxes or changing what was spent. Templates: Admins only, in the
 * action and again in the proc.
 * Writes return ids and stamps only; pages refresh to read the sheet again.
 */

export const saveTemplateAction = action({
  name: "financial-templates.save",
  schema: saveTemplateInput,
  permission: "admin:financial-templates",
  revalidate: ["/settings/financial-templates"],
  handler: async (input, ctx) => {
    const saved = await saveTemplate(input, ctx.session.userId);
    return { templateId: saved.id, rowVer: saved.rowVer };
  },
});

export const deleteTemplateAction = action({
  name: "financial-templates.delete",
  schema: deleteTemplateInput,
  permission: "admin:financial-templates",
  revalidate: ["/settings/financial-templates"],
  handler: async (input, ctx) => {
    await deleteTemplate(input.templateId, input.rowVer, ctx.session.userId);
    return { templateId: input.templateId };
  },
});

export const createFinancialAction = action({
  name: "financials.create",
  schema: createFinancialInput,
  permission: "financials:create",
  handler: async (input, ctx) => {
    const created = await createFinancial(input, ctx.session.userId);
    return { financialId: created.id, projectId: created.projectId };
  },
});

export const updateFinancialAction = action({
  name: "financials.update",
  schema: updateFinancialInput,
  permission: "financials:update",
  handler: async (input, ctx) => {
    const saved = await updateFinancial(input, ctx.session.userId);
    return { financialId: saved.id, rowVer: saved.rowVer };
  },
});

export const setTaxProfilesAction = action({
  name: "financials.setTaxProfiles",
  schema: setTaxProfilesInput,
  permission: "financial-tax-invoices:update",
  handler: async (input, ctx) => {
    const saved = await setTaxProfiles(input, ctx.session.userId);
    return { financialId: saved.id, rowVer: saved.rowVer };
  },
});

export const deleteFinancialAction = action({
  name: "financials.delete",
  schema: deleteFinancialInput,
  permission: "financials:delete",
  handler: async (input, ctx) => {
    await deleteFinancial(input.financialId, input.rowVer, ctx.session.userId);
    return { financialId: input.financialId };
  },
});

export const createLineAction = action({
  name: "financials.createLine",
  schema: createLineInput,
  permission: "financials:create",
  handler: async (input, ctx) => {
    const saved = await createLine(input, ctx.session.userId);
    return { lineId: saved.FinancialLineId, rowVer: saved.RowVer };
  },
});

export const updateLineAction = action({
  name: "financials.updateLine",
  schema: updateLineInput,
  permission: "financials:update",
  handler: async (input, ctx) => {
    const saved = await updateLine(input, ctx.session.userId);
    return { lineId: saved.FinancialLineId, rowVer: saved.RowVer };
  },
});

export const moveLineAction = action({
  name: "financials.moveLine",
  schema: moveLineInput,
  permission: "financials:update",
  handler: async (input, ctx) => {
    const saved = await moveLine(input.lineId, input.direction, input.rowVer, ctx.session.userId);
    return { lineId: saved.FinancialLineId, rowVer: saved.RowVer };
  },
});

export const deleteLineAction = action({
  name: "financials.deleteLine",
  schema: deleteLineInput,
  permission: "financials:delete",
  handler: async (input, ctx) => {
    await deleteLine(input.lineId, input.rowVer, ctx.session.userId);
    return { lineId: input.lineId };
  },
});

export const createTransactionAction = action({
  name: "financials.createTransaction",
  schema: createTransactionInput,
  permission: "financial-tax-invoices:create",
  handler: async (input, ctx) => {
    const saved = await createTransaction(input, ctx.session.userId);
    return { transactionId: saved.FinancialTransactionId, rowVer: saved.RowVer };
  },
});

export const updateTransactionAction = action({
  name: "financials.updateTransaction",
  schema: updateTransactionInput,
  permission: "financial-tax-invoices:update",
  handler: async (input, ctx) => {
    const saved = await updateTransaction(input, ctx.session.userId);
    return { transactionId: saved.FinancialTransactionId, rowVer: saved.RowVer };
  },
});

export const deleteTransactionAction = action({
  name: "financials.deleteTransaction",
  schema: deleteTransactionInput,
  permission: "financial-tax-invoices:delete",
  handler: async (input, ctx) => {
    await deleteTransaction(input.transactionId, input.rowVer, ctx.session.userId);
    return { transactionId: input.transactionId };
  },
});

export const createDocumentAction = action({
  name: "financials.createDocument",
  schema: createDocumentInput,
  permission: "financials:create",
  handler: async (input, ctx) => {
    const saved = await createDocument(input, ctx.session.userId);
    return { documentId: saved.FinancialDocumentId, rowVer: saved.RowVer };
  },
});

export const updateDocumentAction = action({
  name: "financials.updateDocument",
  schema: updateDocumentInput,
  permission: "financials:update",
  handler: async (input, ctx) => {
    const saved = await updateDocument(input, ctx.session.userId);
    return { documentId: saved.FinancialDocumentId, rowVer: saved.RowVer };
  },
});

export const moveDocumentAction = action({
  name: "financials.moveDocument",
  schema: moveDocumentInput,
  permission: "financials:update",
  handler: async (input, ctx) => {
    const saved = await moveDocument(
      input.documentId,
      input.direction,
      input.rowVer,
      ctx.session.userId,
    );
    return { documentId: saved.FinancialDocumentId, rowVer: saved.RowVer };
  },
});

export const deleteDocumentAction = action({
  name: "financials.deleteDocument",
  schema: deleteDocumentInput,
  permission: "financials:delete",
  handler: async (input, ctx) => {
    await deleteDocument(input.documentId, input.rowVer, ctx.session.userId);
    return { documentId: input.documentId };
  },
});

export const copyDocumentsAction = action({
  name: "financials.copyDocuments",
  schema: copyDocumentsInput,
  permission: "financials:create",
  handler: async (input, ctx) => {
    const added = await copyDocumentsFromTemplate(input, ctx.session.userId);
    return { financialId: input.financialId, added };
  },
});
