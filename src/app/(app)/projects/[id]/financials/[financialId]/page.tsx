import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { PageHeader } from "@/components/ui/page-header";
import { auth } from "@/lib/auth/provider";
import { messages } from "@/lib/messages";
import { orNotFound } from "@/lib/row-access";
import { fiscalYearLabel } from "@/modules/financials/calc/fiscal";
import { BudgetPlanner } from "@/modules/financials/components/budget-planner";
import { MonitoringPanel } from "@/modules/financials/components/monitoring-panel";
import { SettingsPanel } from "@/modules/financials/components/settings-panel";
import { getFinancialSheet } from "@/modules/financials/repository/financials";
import { getProjectPermissions } from "@/modules/projects/repository/project-access";
import { parseProjectId } from "../../project-id";

const M = messages.financials;

export const metadata: Metadata = { title: `${M.title} — ${messages.app.name}` };

const TABS = ["budget", "monitoring", "settings"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = {
  budget: M.budgetTab,
  monitoring: M.monitoringTab,
  settings: M.settings,
};

const idSchema = z.coerce.number().int().positive();

/**
 * One financial (ADR-0029; ADR-0010 full-route exception like the meeting
 * workspace): the budget planner, monitoring and the financial's own
 * settings, one tab per ?tab=. A financial of another project than the
 * path's is not found.
 */
export default async function FinancialPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; financialId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth.requireSession();
  const { id, financialId } = await params;
  const projectId = parseProjectId(id);
  const sheetId = idSchema.safeParse(financialId);
  if (projectId === null || !sheetId.success) notFound();

  const [sheet, allows] = await Promise.all([
    orNotFound(getFinancialSheet(sheetId.data, session.userId)),
    getProjectPermissions(projectId, session.userId),
  ]);
  if (sheet.financial.projectId !== projectId) notFound();

  const raw = (await searchParams).tab;
  const tab: Tab = TABS.find((t) => t === raw) ?? "budget";
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
    <>
      <Link
        href={`/projects/${projectId}/financials`}
        className="mt-2 inline-flex min-h-10 items-center text-sm text-accent underline"
      >
        {M.title}
      </Link>
      <PageHeader title={f.title || messages.app.untitled} />
      <p className="-mt-2 mb-3 text-sm text-ink-muted">
        {fiscalYearLabel(f.firstFiscalYear, f.startMonth)} –{" "}
        {fiscalYearLabel(f.firstFiscalYear + f.horizonYears - 1, f.startMonth)}
        {f.templateName ? ` · ${f.templateName}` : ""}
      </p>
      <nav aria-label={M.title} className="mb-4 flex gap-1 border-b border-line">
        {TABS.map((t) => (
          <Link
            key={t}
            href={t === "budget" ? base : `${base}?tab=${t}`}
            aria-current={t === tab ? "page" : undefined}
            className={`inline-flex min-h-11 items-center px-3 text-sm ${
              t === tab
                ? "border-b-2 border-accent font-medium text-ink"
                : "text-ink-muted hover:text-ink"
            }`}
            data-testid={`tab-${t}`}
          >
            {TAB_LABEL[t]}
          </Link>
        ))}
      </nav>
      {tab === "budget" ? <BudgetPlanner sheet={sheet} {...can} /> : null}
      {tab === "monitoring" ? <MonitoringPanel sheet={sheet} {...ledger} /> : null}
      {tab === "settings" ? (
        <SettingsPanel
          key={f.rowVer}
          sheet={sheet}
          canEdit={can.canEdit}
          canDelete={can.canDelete}
          canEditTax={ledger.canEdit}
        />
      ) : null}
    </>
  );
}
