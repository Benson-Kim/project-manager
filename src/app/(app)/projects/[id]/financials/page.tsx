import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/states";
import { auth } from "@/lib/auth/provider";
import { listParamsSchema } from "@/lib/list-params";
import { messages } from "@/lib/messages";
import { orNotFound } from "@/lib/row-access";
import { fiscalYearLabel, fiscalYearOf } from "@/modules/financials/calc/fiscal";
import { centsFromDb, formatMoney } from "@/modules/financials/calc/money";
import { NewFinancialDialog } from "@/modules/financials/components/new-financial-dialog";
import { listFinancials } from "@/modules/financials/repository/financials";
import { listTemplates } from "@/modules/financials/repository/templates";
import { getProjectPermissions } from "@/modules/projects/repository/project-access";
import { parseProjectId } from "../project-id";

const M = messages.financials;

export const metadata: Metadata = { title: `${M.title} — ${messages.app.name}` };

/**
 * The project's financials (ADR-0029): one row per budget sheet (a project can
 * hold several, e.g. one per funding envelope), with its document checklist
 * status (ADR-0030). Managers create them from a master template or blank.
 * "Export all to CSV" writes one row per financial (any reader).
 */
export default async function FinancialsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth.requireSession();
  const { id } = await params;
  const projectId = parseProjectId(id);
  if (projectId === null) notFound();

  const [rows, allows, templates] = await Promise.all([
    orNotFound(listFinancials(listParamsSchema.parse({}), session.userId, projectId, 100)),
    getProjectPermissions(projectId, session.userId),
    listTemplates(session.userId),
  ]);
  const canCreate = allows("financials:create");
  const startMonth = templates[0]?.definition.fiscalYearStartMonth ?? 4;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <PageHeader
        title={M.title}
        action={
          canCreate ? (
            <NewFinancialDialog
              projectId={projectId}
              templates={templates.map((t) => ({ id: t.id, name: t.name }))}
              defaultFirstYear={fiscalYearOf(today, startMonth) ?? new Date().getFullYear()}
            />
          ) : undefined
        }
      />
      {rows.length > 0 ? (
        <p className="mb-3">
          <a
            href={`/projects/${projectId}/financials/export`}
            className="inline-flex min-h-10 items-center text-sm text-accent underline"
            data-testid="export-project-csv"
          >
            {M.exportProjectCsv}
          </a>
        </p>
      ) : null}
      {rows.length === 0 ? (
        <EmptyState title={M.title} body={M.emptyBody} />
      ) : (
        <ul className="flex flex-col gap-2" data-testid="financial-list">
          {rows.map((row) => {
            const last = row.FirstFiscalYear + row.HorizonYears - 1;
            return (
              <li key={row.FinancialId}>
                <Link
                  href={`/projects/${projectId}/financials/${row.FinancialId}`}
                  className="flex min-h-11 flex-col gap-1 rounded-md border border-line bg-surface px-4 py-3 hover:bg-surface-raised sm:flex-row sm:items-center sm:gap-4"
                >
                  <span className="font-medium text-ink">{row.Title || messages.app.untitled}</span>
                  <span className="text-sm text-ink-muted">
                    {fiscalYearLabel(row.FirstFiscalYear, row.FiscalYearStartMonth)} –{" "}
                    {fiscalYearLabel(last, row.FiscalYearStartMonth)}
                  </span>
                  {row.BudgetEnvelope ? (
                    <span className="text-sm text-ink-muted">{row.BudgetEnvelope}</span>
                  ) : null}
                  {row.DocumentCount > 0 ? (
                    <span className="text-sm text-ink-muted" data-testid="financial-documents">
                      {M.documents.summary(
                        row.DocumentsRequired,
                        row.DocumentsRequiredWithFile,
                        row.DocumentsUndecided,
                      )}
                    </span>
                  ) : null}
                  {row.Budget !== null ? (
                    <span className="text-sm text-ink tabular-nums sm:ml-auto">
                      {M.budget}: {formatMoney(centsFromDb(row.Budget))}
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
