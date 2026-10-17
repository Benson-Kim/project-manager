import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { auth } from "@/lib/auth/provider";
import { messages } from "@/lib/messages";
import { listTemplates } from "@/modules/financials/repository/templates";

const T = messages.financials.templates;

export const metadata: Metadata = { title: `${T.title} — ${messages.app.name}` };

/**
 * Master financial templates (ADR-0029): every signed-in user can read them
 * (project Managers pick one); only Admins create and edit.
 */
export default async function FinancialTemplatesPage() {
  const session = await auth.requireSession();
  const templates = await listTemplates(session.userId);
  const isAdmin = session.role === "Admin";

  return (
    <>
      <PageHeader
        title={T.title}
        action={
          isAdmin ? (
            <Link
              href="/settings/financial-templates/new"
              data-testid="new-template"
              className="inline-flex min-h-10 items-center rounded-md border border-line bg-surface px-4 text-sm font-medium text-ink hover:bg-surface-raised"
            >
              {T.newTemplate}
            </Link>
          ) : undefined
        }
      />
      <p className="text-sm text-ink-muted">{T.intro}</p>
      <ul className="mt-4 flex flex-col gap-2" data-testid="template-list">
        {templates.map((t) => (
          <li key={t.id}>
            <Link
              href={`/settings/financial-templates/${t.id}`}
              className="flex min-h-11 flex-wrap items-center gap-3 rounded-md border border-line bg-surface px-4 py-2 hover:bg-surface-raised"
            >
              <span className="font-medium text-ink">{t.name}</span>
              {t.isDefault ? <Badge value={T.defaultBadge} /> : null}
              <span className="text-sm text-ink-muted">
                {messages.financials.yearsCount(t.definition.horizonYears)} ·{" "}
                {t.definition.lines.length} {T.standardLines.toLowerCase()}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
