import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ListPager } from "@/components/ui/data-view/list-pager";
import { SearchInput } from "@/components/ui/data-view/search-input";
import { PageHeader } from "@/components/ui/page-header";
import { auth } from "@/lib/auth/provider";
import { formatDateTime } from "@/lib/format";
import { DEFAULT_PAGE_SIZE, parseListParams, totalPages } from "@/lib/list-params";
import { messages } from "@/lib/messages";
import { actorText, entityText, humanize } from "@/modules/audit/model";
import { listAuditLog } from "@/modules/audit/repository/audit-log";
import { AUDIT_SORT } from "@/modules/audit/schemas/audit-log";

const A = messages.settings.audit;

export const metadata: Metadata = { title: `${A.title} — ${messages.app.name}` };

/**
 * Settings > Audit log, Admin only. notFound() for a User keeps the page out of reach, and
 * usp_Audit_List refuses a non-Admin too, so hiding the link is never the only control.
 */
export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth.requireSession();
  if (session.role !== "Admin") notFound();
  const params = parseListParams(await searchParams, AUDIT_SORT);
  const { rows, totalCount } = await listAuditLog(params, session.userId);

  return (
    <>
      <PageHeader title={A.title} />
      <div className="mb-4">
        <SearchInput testId="audit-search" placeholder={A.search} />
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-muted">{A.empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table data-testid="audit-table" className="w-full text-left text-sm">
            <thead className="text-ink-muted">
              <tr>
                <th scope="col" className="py-2 pr-4 font-medium">
                  {A.when}
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  {A.who}
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  {A.action}
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  {A.what}
                </th>
                <th scope="col" className="py-2 font-medium">
                  <span className="sr-only">{messages.datasheet.actions}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const when = formatDateTime(row.OccurredAtUtc);
                const action = humanize(row.Action);
                const what = entityText(row);
                return (
                  <tr key={row.AuditLogId} className="border-t border-line">
                    <td className="py-2 pr-4 whitespace-nowrap text-ink">{when}</td>
                    <td className="py-2 pr-4 text-ink">{actorText(row)}</td>
                    <td className="py-2 pr-4 text-ink">{action}</td>
                    <td className="py-2 pr-4 text-ink">{what}</td>
                    <td className="py-2">
                      <Link
                        href={`/settings/audit/${row.AuditLogId}`}
                        aria-label={A.viewEntry(action, what, when)}
                        className="inline-flex min-h-10 items-center font-medium text-accent"
                      >
                        {A.view}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <ListPager
        className="mt-4"
        page={params.page}
        pages={totalPages(totalCount, DEFAULT_PAGE_SIZE)}
      />
    </>
  );
}
