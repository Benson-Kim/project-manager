import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { buttonClass } from "@/components/ui/button-styles";
import { Chevron } from "@/components/ui/chevron";
import { Menu, MenuLink } from "@/components/ui/menu";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { auth } from "@/lib/auth/provider";
import { uploadsEnabled } from "@/lib/env";
import { listParamsSchema } from "@/lib/list-params";
import { messages } from "@/lib/messages";
import { orNotFound } from "@/lib/row-access";
import { fiscalYearLabel, fiscalYearOf } from "@/modules/financials/calc/fiscal";
import { centsFromDb, formatMoney } from "@/modules/financials/calc/money";
import { BudgetPlanner } from "@/modules/financials/components/budget-planner";
import { DocumentsPanel } from "@/modules/financials/components/documents-panel";
import { MonitoringPanel } from "@/modules/financials/components/monitoring-panel";
import { NewFinancialDialog } from "@/modules/financials/components/new-financial-dialog";
import { SettingsPanel } from "@/modules/financials/components/settings-panel";
import { getFinancialSheet, listFinancials } from "@/modules/financials/repository/financials";
import { listTemplates } from "@/modules/financials/repository/templates";
import { getProjectPermissions } from "@/modules/projects/repository/project-access";
import { parseProjectId } from "../project-id";

const M = messages.financials;

/** The views of a financial; each is a project section (the nav's Financials group). */
export const FINANCIAL_TABS = ["budget", "monitoring", "documents", "settings"] as const;
export type FinancialTab = (typeof FINANCIAL_TABS)[number];

export const financialTabHref = (projectId: number, tab: FinancialTab, financialId?: number) =>
  `/projects/${projectId}/financials/${tab}${financialId ? `?f=${financialId}` : ""}`;

const idSchema = z.coerce.number().int().positive();

/**
 * One view of the project's financial (ADR-0029; ADR-0010 full-route exception):
 * the budget planner, monitoring, the document checklist (ADR-0030) or the
 * financial's own settings. ?f=<id> names the financial; a project with exactly
 * one opens it directly, otherwise the project's financials are listed to pick
 * from (several, e.g. one per funding envelope) and the header switches
 * between them. A financial of another project is not found.
 */
export async function FinancialView({
  tab,
  params,
  searchParams,
}: {
  tab: FinancialTab;
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth.requireSession();
  const projectId = parseProjectId((await params).id);
  if (projectId === null) notFound();
  const raw = (await searchParams).f;
  const picked = raw === undefined ? null : idSchema.safeParse(Array.isArray(raw) ? raw[0] : raw);
  if (picked && !picked.success) notFound();

  const [rows, allows, templates] = await Promise.all([
    orNotFound(listFinancials(listParamsSchema.parse({}), session.userId, projectId, 100)),
    getProjectPermissions(projectId, session.userId),
    listTemplates(session.userId),
  ]);
  if (picked && !rows.some((r) => r.FinancialId === picked.data)) notFound();
  const chosen = picked?.data ?? (rows.length === 1 ? rows[0]!.FinancialId : null);

  const startMonth = templates[0]?.definition.fiscalYearStartMonth ?? 4;
  const today = new Date().toISOString().slice(0, 10);
  const newFinancial = allows("financials:create") ? (
    <NewFinancialDialog
      projectId={projectId}
      templates={templates.map((t) => ({ id: t.id, name: t.name }))}
      defaultFirstYear={fiscalYearOf(today, startMonth) ?? new Date().getFullYear()}
    />
  ) : null;

  if (chosen === null) {
    return (
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 pb-8 sm:px-6">
        <PageHeader title={M.title} action={newFinancial} />
        {rows.length === 0 ? (
          <EmptyState title={M.title} body={M.emptyBody} />
        ) : (
          <Panel
            id="financial-list-heading"
            title={M.pickFinancial}
            action={
              <a
                href={`/projects/${projectId}/financials/export`}
                className={buttonClass("ghost")}
                data-testid="export-project-csv"
              >
                {M.exportProjectCsv}
              </a>
            }
          >
            <ul className="flex flex-col gap-2" data-testid="financial-list">
              {rows.map((row) => {
                const last = row.FirstFiscalYear + row.HorizonYears - 1;
                return (
                  <li key={row.FinancialId}>
                    <Link
                      href={financialTabHref(projectId, tab, row.FinancialId)}
                      className="flex min-h-11 flex-col gap-1 rounded-md border border-line bg-surface px-4 py-3 hover:bg-surface-raised sm:flex-row sm:items-center sm:gap-4"
                    >
                      <span className="font-medium text-ink">
                        {row.Title || messages.app.untitled}
                      </span>
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
                          {M.budget}: {formatMoney(centsFromDb(row.Budget), row.CurrencyCode)}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Panel>
        )}
      </div>
    );
  }

  const sheet = await orNotFound(getFinancialSheet(chosen, session.userId));
  if (sheet.financial.projectId !== projectId) notFound();
  const f = sheet.financial;
  const can = {
    canCreate: allows("financials:create"),
    canEdit: allows("financials:update"),
    canDelete: allows("financials:delete"),
  };
  // Tax profiles and invoices are their own section (ADR-0029 amendment).
  const ledger = {
    canCreate: allows("financial-tax-invoices:create"),
    canEdit: allows("financial-tax-invoices:update"),
    canDelete: allows("financial-tax-invoices:delete"),
  };
  const base = `/projects/${projectId}/financials/${f.id}`;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 pb-8 sm:px-6">
      <PageHeader
        title={f.title || messages.app.untitled}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {rows.length > 1 ? (
              <Menu
                label={M.switchFinancial}
                testId="switch-financial"
                triggerClassName={buttonClass("secondary")}
                trigger={
                  <>
                    {M.switchFinancial}
                    <Chevron />
                  </>
                }
              >
                {rows.map((row) => (
                  <MenuLink
                    key={row.FinancialId}
                    href={financialTabHref(projectId, tab, row.FinancialId)}
                  >
                    {row.Title || messages.app.untitled}
                  </MenuLink>
                ))}
              </Menu>
            ) : null}
            {newFinancial}
          </div>
        }
      />
      <div className="-mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-sm text-ink-muted">
          {fiscalYearLabel(f.firstFiscalYear, f.startMonth)} –{" "}
          {fiscalYearLabel(f.firstFiscalYear + f.horizonYears - 1, f.startMonth)}
          {f.templateName ? ` · ${f.templateName}` : ""}
        </p>
        <p className="flex flex-wrap gap-2" data-testid="financial-outputs">
          <Link href={`${base}/print`} className={buttonClass("ghost")}>
            {M.print}
          </Link>
          <a href={`${base}/pdf`} className={buttonClass("ghost")}>
            {M.downloadPdf}
          </a>
          <a href={`${base}/export`} className={buttonClass("ghost")}>
            {M.exportCsv}
          </a>
        </p>
      </div>
      {tab === "budget" ? (
        <BudgetPlanner sheet={sheet} {...can} canEditTax={ledger.canEdit} />
      ) : null}
      {tab === "monitoring" ? <MonitoringPanel sheet={sheet} {...ledger} /> : null}
      {tab === "documents" ? (
        <DocumentsPanel
          sheet={sheet}
          templates={
            can.canCreate
              ? templates.map((t) => ({ id: t.id, name: t.name, isDefault: t.isDefault }))
              : []
          }
          {...can}
          uploadsEnabled={uploadsEnabled()}
        />
      ) : null}
      {tab === "settings" ? (
        <SettingsPanel
          key={f.rowVer}
          sheet={sheet}
          canEdit={can.canEdit}
          canDelete={can.canDelete}
          canEditTax={ledger.canEdit}
        />
      ) : null}
    </div>
  );
}
