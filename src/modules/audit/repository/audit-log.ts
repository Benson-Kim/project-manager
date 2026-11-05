import { execProc } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { DEFAULT_PAGE_SIZE, toProcListParams, type ListParams } from "@/lib/list-params";
import {
  auditEntrySchema,
  auditLogRowSchema,
  type AuditEntry,
  type AuditLogRow,
} from "../schemas/audit-log";

/**
 * Audit log reads — stored procedures only, zod row parsing (STANDARDS §2.5). Both procs refuse a
 * non-Admin (FORBIDDEN_ROW), so a caller that skips the page's role check still gets nothing.
 */

export async function listAuditLog(
  params: ListParams,
  actorUserId: number,
  pageSize: number = DEFAULT_PAGE_SIZE,
): Promise<{ rows: AuditLogRow[]; totalCount: number }> {
  // The proc appends TotalCount to every row; the row schema strips it.
  const rows = await execProc<AuditLogRow & { TotalCount: number }>("usp_Audit_List", {
    ActorUserId: actorUserId,
    ProjectId: null,
    ...toProcListParams(params, pageSize),
  });
  return {
    rows: rows.map((r) => auditLogRowSchema.parse(r)),
    totalCount: Number(rows[0]?.TotalCount ?? 0),
  };
}

export async function getAuditEntry(auditLogId: number, actorUserId: number): Promise<AuditEntry> {
  const rows = await execProc<AuditEntry>("usp_Audit_GetById", {
    AuditLogId: auditLogId,
    ActorUserId: actorUserId,
  });
  if (!rows[0]) throw new AppError("NOT_FOUND", "Audit entry not found");
  return auditEntrySchema.parse(rows[0]);
}
