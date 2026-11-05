import { BACKUP_COPY_OVERDUE_DAYS, copyOverdue, type BackupStatus } from "./backup-status";
import { COPY_NOW_LABEL } from "./tray-menu";

/** While copies stay overdue, the reminder comes back at most this often. */
export const COPY_REMINDER_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Copies are known to be overdue. No status yet (a first start, or the first start after an
 * update that added the status file) says nothing either way, so it never reminds on a guess.
 */
export function knownCopyOverdue(status: BackupStatus | null, now: Date): boolean {
  return status !== null && copyOverdue(status, now);
}

/** Remind when copies are overdue and the last reminder, if any, was a day or more ago. */
export function reminderDue(
  status: BackupStatus | null,
  lastRemindedAt: Date | null,
  now: Date,
): boolean {
  if (!knownCopyOverdue(status, now)) return false;
  return !lastRemindedAt || now.getTime() - lastRemindedAt.getTime() >= COPY_REMINDER_INTERVAL_MS;
}

/** A status with no copy at all is overdue at once, so only a past copy is counted in days. */
export function copyReminder(
  copyDir: string,
  status: BackupStatus | null,
): { title: string; content: string } {
  const lead = status?.lastCopy
    ? `No backup has been copied to ${copyDir} in the last ${BACKUP_COPY_OVERDUE_DAYS} days.`
    : `No backup has been copied to ${copyDir} yet.`;
  return {
    title: "Backups are not being copied",
    content: `${lead} Use "${COPY_NOW_LABEL}" in the tray menu.`,
  };
}
