import fs from "fs/promises";
import path from "path";
import type { BackupKind, BackupResult } from "./backup";
import type { Logger } from "./log";

/**
 * The latest backup runs on this PC, read by Settings > Backup status and the copy reminder.
 * A JSON file in userData, not a table: a restore replaces the database and would roll a
 * table's history back with it, and this is the PC's own state, not app data.
 */
export const BACKUP_STATUS_FILE_NAME = "backup-status.json";

/** No copy off this PC for this many days is overdue. The web page keeps the same number. */
export const BACKUP_COPY_OVERDUE_DAYS = 7;

/** Error text kept in the file; the web reader refuses anything longer. */
export const MAX_STATUS_MESSAGE = 1000;

export interface BackupStatus {
  version: 1;
  lastAttempt: { at: string; kind: BackupKind; ok: boolean; error?: string };
  lastSuccess?: { at: string; kind: BackupKind; bytes: number };
  lastCopy?: { at: string; copyDir: string };
  lastCopyError?: { at: string; copyDir: string; message: string };
}

export type BackupOutcome = { result: BackupResult; copyDir?: string } | { error: unknown };

function messageOf(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  return text.slice(0, MAX_STATUS_MESSAGE);
}

/**
 * The status after one run. A failure keeps the last success and copy. A copy counts only when
 * it finished: a copy that failed part way (attachments) keeps the older copy and records why.
 */
export function nextBackupStatus(
  previous: BackupStatus | null,
  kind: BackupKind,
  outcome: BackupOutcome,
  now: Date,
): BackupStatus {
  const at = now.toISOString();
  if ("error" in outcome) {
    return {
      ...previous,
      version: 1,
      lastAttempt: { at, kind, ok: false, error: messageOf(outcome.error) },
    };
  }
  const { result, copyDir } = outcome;
  const status: BackupStatus = {
    ...previous,
    version: 1,
    lastAttempt: { at, kind, ok: true },
    lastSuccess: { at, kind, bytes: result.bytes },
  };
  if (!copyDir) return status;
  if (result.copyError) {
    status.lastCopyError = { at, copyDir, message: messageOf(result.copyError) };
  } else if (result.copy) {
    status.lastCopy = { at, copyDir };
    delete status.lastCopyError;
  }
  return status;
}

/** True when nothing has been copied off this PC, or not for BACKUP_COPY_OVERDUE_DAYS. */
export function copyOverdue(status: BackupStatus | null, now: Date): boolean {
  const last = status?.lastCopy ? Date.parse(status.lastCopy.at) : NaN;
  if (Number.isNaN(last)) return true;
  return now.getTime() - last > BACKUP_COPY_OVERDUE_DAYS * 24 * 60 * 60 * 1000;
}

/** The recorded status, or null when there is none or it cannot be read. */
export async function readBackupStatus(file: string): Promise<BackupStatus | null> {
  try {
    const parsed = JSON.parse(await fs.readFile(file, "utf8")) as Partial<BackupStatus> | null;
    if (parsed?.version !== 1 || typeof parsed.lastAttempt?.at !== "string") return null;
    return parsed as BackupStatus;
  } catch {
    return null;
  }
}

/**
 * Records one run, written whole to a temporary file and renamed over the old one so a reader
 * never sees half a file. Never throws: the status is a report, and a backup or restore must not
 * fail because it could not be written.
 */
export async function recordBackup(
  file: string,
  kind: BackupKind,
  outcome: BackupOutcome,
  log: Logger,
  now = new Date(),
): Promise<void> {
  try {
    const status = nextBackupStatus(await readBackupStatus(file), kind, outcome, now);
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(status, null, 2), "utf8");
    await fs.rename(tmp, file);
  } catch (err) {
    log.warn(`[backup] could not record the backup status in ${file}: ${messageOf(err)}`);
  }
}
