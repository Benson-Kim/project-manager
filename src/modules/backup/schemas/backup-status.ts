import { z } from "zod";

/** The kinds of backup the desktop app takes (electron/backup.ts BackupKind). */
export const BACKUP_KINDS = ["daily", "manual", "pre-upgrade", "pre-restore"] as const;
export type BackupKind = (typeof BACKUP_KINDS)[number];

/** The longest error text the desktop app writes; anything longer is not its file. */
export const MAX_STATUS_MESSAGE = 1000;

const at = z.iso.datetime({ offset: true });
const kind = z.enum(BACKUP_KINDS);
const text = z.string().max(MAX_STATUS_MESSAGE);

/**
 * backup-status.json as electron/backup-status.ts writes it. Strict, so a file in any other
 * shape is treated as no status rather than shown in part.
 */
export const backupStatusSchema = z
  .object({
    version: z.literal(1),
    lastAttempt: z.object({ at, kind, ok: z.boolean(), error: text.optional() }).strict(),
    lastSuccess: z
      .object({ at, kind, bytes: z.number().int().min(0) })
      .strict()
      .optional(),
    lastCopy: z.object({ at, copyDir: text }).strict().optional(),
    lastCopyError: z.object({ at, copyDir: text, message: text }).strict().optional(),
  })
  .strict();
export type BackupStatus = z.infer<typeof backupStatusSchema>;
