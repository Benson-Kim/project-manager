import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { auth } from "@/lib/auth/provider";
import { AppError } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { messages } from "@/lib/messages";
import { actorText, diffAudit, entityText, humanize } from "@/modules/audit/model";
import { getAuditEntry } from "@/modules/audit/repository/audit-log";
import { auditEntryIdParam } from "@/modules/audit/schemas/audit-log";

const A = messages.settings.audit;

export const metadata: Metadata = { title: `${A.entry} — ${messages.app.name}` };

/**
 * One audit entry, Admin only (notFound() here, FORBIDDEN_ROW in usp_Audit_GetById). Every value
 * is rendered as React text, never as markup: an entry can hold whatever a user typed.
 */
export default async function AuditEntryPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth.requireSession();
  if (session.role !== "Admin") notFound();
  const id = auditEntryIdParam.safeParse((await params).id);
  if (!id.success) notFound();

  const entry = await getAuditEntry(id.data, session.userId).catch((err: unknown) => {
    if (err instanceof AppError && err.code === "NOT_FOUND") notFound();
    throw err;
  });
  const diff = diffAudit(entry.BeforeJson, entry.AfterJson);

  return (
    <>
      <PageHeader title={`${humanize(entry.Action)}: ${entityText(entry)}`} />
      <dl className="mb-6 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-ink-muted">{A.when}</dt>
        <dd className="text-ink">{formatDateTime(entry.OccurredAtUtc)}</dd>
        <dt className="text-ink-muted">{A.who}</dt>
        <dd className="text-ink">{actorText(entry)}</dd>
        {entry.IpAddress ? (
          <>
            <dt className="text-ink-muted">{A.ipAddress}</dt>
            <dd className="text-ink">{entry.IpAddress}</dd>
          </>
        ) : null}
      </dl>
      {diff.length === 0 ? (
        <p className="text-sm text-ink-muted">{A.nothingRecorded}</p>
      ) : (
        <div className="overflow-x-auto">
          <table data-testid="audit-diff" className="w-full text-left text-sm">
            <thead className="text-ink-muted">
              <tr>
                <th scope="col" className="py-2 pr-4 font-medium">
                  {A.field}
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  {A.before}
                </th>
                <th scope="col" className="py-2 font-medium">
                  {A.after}
                </th>
              </tr>
            </thead>
            <tbody>
              {diff.map((row) => (
                <tr
                  key={row.field}
                  data-changed={row.changed || undefined}
                  className="border-t border-line align-top"
                >
                  <th scope="row" className="py-2 pr-4 font-medium text-ink">
                    {humanize(row.field)}
                    {row.changed ? <span className="sr-only"> ({A.changed})</span> : null}
                  </th>
                  <td className="py-2 pr-4 break-words whitespace-pre-wrap text-ink-muted">
                    {row.before ?? ""}
                  </td>
                  <td
                    className={`py-2 break-words whitespace-pre-wrap ${row.changed ? "font-medium text-ink" : "text-ink-muted"}`}
                  >
                    {row.after ?? ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Link
        href="/settings/audit"
        className="mt-4 inline-flex min-h-10 items-center text-sm font-medium text-accent"
      >
        {A.back}
      </Link>
    </>
  );
}
