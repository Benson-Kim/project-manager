import type { z } from "zod";
import { execProc } from "@/lib/db";
import {
  savedDocumentRowSchema,
  type copyDocumentsInput,
  type createDocumentInput,
  type updateDocumentInput,
} from "../schemas/documents";

/**
 * A financial's document checklist (ADR-0030) — stored procedures only. Every
 * write resolves the financial and its project from the row inside the proc;
 * attachments go through the file-storage owner "financial-document".
 * Writes take the actions' parsed input (the transforms are not idempotent).
 */

type DocumentFields = Omit<z.output<typeof createDocumentInput>, "financialId">;

function documentParams(p: DocumentFields) {
  return {
    Name: p.name,
    IsRequired: p.required,
    ReasonNotCreated: p.reason,
    Suggestions: JSON.stringify(p.suggestions),
  };
}

export async function createDocument(p: z.output<typeof createDocumentInput>, actorUserId: number) {
  const rows = await execProc("usp_FinancialDocument_Create", {
    FinancialId: p.financialId,
    ...documentParams(p),
    ActorUserId: actorUserId,
  });
  return savedDocumentRowSchema.parse(rows[0]);
}

export async function updateDocument(p: z.output<typeof updateDocumentInput>, actorUserId: number) {
  const rows = await execProc("usp_FinancialDocument_Update", {
    FinancialDocumentId: p.documentId,
    ...documentParams(p),
    RowVer: p.rowVer,
    ActorUserId: actorUserId,
  });
  return savedDocumentRowSchema.parse(rows[0]);
}

export async function moveDocument(
  documentId: number,
  direction: "up" | "down",
  rowVer: number,
  actorUserId: number,
) {
  const rows = await execProc("usp_FinancialDocument_Move", {
    FinancialDocumentId: documentId,
    Direction: direction,
    RowVer: rowVer,
    ActorUserId: actorUserId,
  });
  return savedDocumentRowSchema.parse(rows[0]);
}

export async function deleteDocument(
  documentId: number,
  rowVer: number,
  actorUserId: number,
): Promise<void> {
  await execProc("usp_FinancialDocument_Delete", {
    FinancialDocumentId: documentId,
    RowVer: rowVer,
    ActorUserId: actorUserId,
  });
}

export async function copyDocumentsFromTemplate(
  p: z.output<typeof copyDocumentsInput>,
  actorUserId: number,
): Promise<number> {
  const rows = await execProc<{ Added: number }>("usp_FinancialDocument_CreateFromTemplate", {
    FinancialId: p.financialId,
    FinancialTemplateId: p.templateId,
    ActorUserId: actorUserId,
  });
  return rows[0]?.Added ?? 0;
}
