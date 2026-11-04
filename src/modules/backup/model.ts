import type { BackupStatus } from "./schemas/backup-status";

/** No copy off this PC for this many days is overdue. The desktop's reminder uses the same number. */
export const BACKUP_COPY_OVERDUE_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/** True when nothing has been copied off this PC, or not for BACKUP_COPY_OVERDUE_DAYS. */
export function copyOverdue(status: BackupStatus | null, now: Date): boolean {
  const last = status?.lastCopy ? Date.parse(status.lastCopy.at) : NaN;
  if (Number.isNaN(last)) return true;
  return now.getTime() - last > BACKUP_COPY_OVERDUE_DAYS * DAY_MS;
}

/**
 * Copies are known to be overdue. No status yet (a new install, or a PC updated since its last
 * backup) says nothing either way, as on the desktop's reminder.
 */
export function knownCopyOverdue(status: BackupStatus | null, now: Date): boolean {
  return status !== null && copyOverdue(status, now);
}

/** A backup's size as shown: megabytes to one decimal place. */
export function backupSizeMb(bytes: number): string {
  return (bytes / 1048576).toFixed(1);
}
