import fs from "fs/promises";
import path from "path";
import { backupStatusSchema, type BackupStatus } from "../schemas/backup-status";

/**
 * This PC's backup-status.json, which the desktop app passes in BACKUP_STATUS_FILE. Null in the
 * web edition, where the env is empty and there is no backup status to show.
 */
export function backupStatusFile(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string | null {
  const file = env.BACKUP_STATUS_FILE?.trim();
  return file && path.isAbsolute(file) ? file : null;
}

/** The recorded status, or null when nothing is recorded yet or the file cannot be read. */
export async function readBackupStatus(file: string): Promise<BackupStatus | null> {
  try {
    const parsed = backupStatusSchema.safeParse(JSON.parse(await fs.readFile(file, "utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
