import { z } from "zod";
import type { ListSort } from "@/lib/list-params";

/** usp_Audit_List is newest first unless the URL asks for OccurredAtUtc ascending. */
export const AUDIT_SORT: ListSort = { columns: ["OccurredAtUtc"], default: null };

/** tedious returns BIGINT as a string — coerce (LESSONS §10). */
const auditLogIdSchema = z.coerce.number().int().positive();

/** usp_Audit_List row. BeforeJson and AfterJson are left out of the list: they can be large. */
export const auditLogRowSchema = z.object({
  AuditLogId: auditLogIdSchema,
  ActorUserId: z.number().int().nullable(),
  ActorName: z.string().nullable(),
  ActorUsername: z.string().nullable(),
  Action: z.string(),
  EntityName: z.string(),
  EntityId: z.string().nullable(),
  IpAddress: z.string().nullable(),
  OccurredAtUtc: z.date(),
});
export type AuditLogRow = z.infer<typeof auditLogRowSchema>;

/** usp_Audit_GetById row: one entry with what it changed. */
export const auditEntrySchema = auditLogRowSchema.extend({
  BeforeJson: z.string().nullable(),
  AfterJson: z.string().nullable(),
});
export type AuditEntry = z.infer<typeof auditEntrySchema>;

/** The [id] route segment: digits only, so "1e3", "0x10" or " 7" never reach the proc. */
export const auditEntryIdParam = z
  .string()
  .regex(/^[1-9]\d{0,14}$/)
  .transform(Number);
