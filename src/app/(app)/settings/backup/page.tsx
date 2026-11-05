import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { auth } from "@/lib/auth/provider";
import { formatDateTime } from "@/lib/format";
import { messages } from "@/lib/messages";
import { BACKUP_COPY_OVERDUE_DAYS, backupSizeMb, knownCopyOverdue } from "@/modules/backup/model";
import { backupStatusFile, readBackupStatus } from "@/modules/backup/repository/backup-status";

const B = messages.settings.backup;

export const metadata: Metadata = { title: `${B.title} — ${messages.app.name}` };

/**
 * Settings > Backup status, Admin only and desktop only: the web edition has no backup file to
 * read. The status is this PC's own record of its backups, not app data, so there is no proc to
 * refuse a User and notFound() here is the one control; nothing in it is secret. No file yet (a
 * new install, or a PC updated since its last backup) is shown as not recorded, never as overdue.
 */
export default async function BackupStatusPage() {
  const session = await auth.requireSession();
  if (session.role !== "Admin") notFound();
  const file = backupStatusFile();
  if (!file) notFound();
  const status = await readBackupStatus(file);
  const success = status?.lastSuccess;
  const attempt = status?.lastAttempt;
  const copy = status?.lastCopy;
  const copyError = status?.lastCopyError;

  return (
    <>
      <PageHeader title={B.title} />
      {status ? (
        <dl data-testid="backup-status" className="grid gap-4 text-sm">
          <div>
            <dt className="font-medium text-ink">{B.lastBackup}</dt>
            <dd className="text-ink-muted">
              {success
                ? B.backupLine(
                    formatDateTime(success.at),
                    B.kinds[success.kind],
                    backupSizeMb(success.bytes),
                  )
                : B.noBackup}
            </dd>
            {attempt && !attempt.ok ? (
              <dd className="mt-1 text-ink">
                {B.lastFailed(formatDateTime(attempt.at))} {attempt.error}
              </dd>
            ) : null}
          </div>
          <div>
            <dt className="font-medium text-ink">{B.lastCopy}</dt>
            <dd className="text-ink-muted">
              {copy ? B.copyLine(formatDateTime(copy.at), copy.copyDir) : B.noCopy}
            </dd>
            {copyError ? (
              <dd className="mt-1 text-ink">
                {B.copyFailed(formatDateTime(copyError.at), copyError.copyDir)} {copyError.message}
              </dd>
            ) : null}
          </div>
        </dl>
      ) : (
        <p data-testid="backup-status" className="text-sm text-ink-muted">
          {B.notRecorded}
        </p>
      )}
      {knownCopyOverdue(status, new Date()) ? (
        <p data-testid="backup-overdue" className="mt-6 text-sm font-medium text-ink">
          {B.overdue(BACKUP_COPY_OVERDUE_DAYS)} {B.overdueRisk} {B.overdueAction}
        </p>
      ) : null}
      <Link
        href="/settings"
        className="mt-6 inline-flex min-h-10 items-center text-sm font-medium text-accent"
      >
        {messages.nav.settings}
      </Link>
    </>
  );
}
