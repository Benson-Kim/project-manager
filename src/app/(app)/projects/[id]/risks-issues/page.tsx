import { withRichViews } from "@/components/ui/rich-text/rich-views";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { auth } from "@/lib/auth/provider";
import { flattenSearchParams, parseListParams, initialViewOf } from "@/lib/list-params";
import { messages } from "@/lib/messages";
import { getListPreference } from "@/lib/repositories/view-preference";
import { orNotFound, orNull } from "@/lib/row-access";
import { getProjectPermissions } from "@/modules/projects/repository/project-access";
import { RiskIssueSheet } from "@/modules/risks-issues/components/risk-issue-sheet";
import { RisksIssuesView } from "@/modules/risks-issues/components/risks-issues-view";
import { getRiskIssueById, listRiskIssues } from "@/modules/risks-issues/repository/risk-issues";
import { buildNewEntityHref, guardProjectScope } from "@/lib/project-page-helpers";
import { parseProjectId } from "../project-id";
import { LookupListsScope } from "@/modules/lookup-lists/components/lookup-lists-scope";
import { loadLookupLists } from "@/modules/lookup-lists/queries/load-lookup-lists";
import { RISK_ISSUE_LISTS, RISK_ISSUE_SORT } from "@/modules/risks-issues/schemas/risk-issue";

export const metadata: Metadata = {
  title: `${messages.risksIssues.title} — ${messages.app.name}`,
};

/**
 * Risks & issues register — project-scoped section under
 * /projects/[id]/risks-issues; DataView + search + category/status filters;
 * detail/edit in the URL-synced Sheet (?id=<n> | ?id=new, ADR-0010).
 * Default sort: RiskIssueId asc (proc default) — the order they were raised in.
 */
export default async function RisksIssuesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth.requireSession();
  const { id } = await params;
  const projectId = parseProjectId(id);
  if (projectId === null) notFound();

  const raw = await searchParams;
  const flat = flattenSearchParams(raw);
  const listParams = parseListParams(raw, RISK_ISSUE_SORT);

  const isNew = flat.id === "new";
  const rawId = !isNew && flat.id ? Number(flat.id) : null;
  // Guard against Infinity (e.g. "1e308") and non-integers before hitting the DB.
  const selectedId =
    rawId !== null && Number.isFinite(rawId) && Number.isInteger(rawId) && rawId > 0 ? rawId : null;

  // Empty-string filter params are coerced to null so the proc treats them as
  // "no filter" rather than filtering for the empty string.
  const filters = {
    category: flat.category?.trim() || null,
    status: flat.status?.trim() || null,
  };

  const [rows, preference, selectedRaw, allows, lookup] = await Promise.all([
    orNotFound(listRiskIssues(listParams, session.userId, projectId, filters)),
    getListPreference(session.userId, "risks-issues").catch(() => null),
    selectedId ? orNull(getRiskIssueById(selectedId, session.userId)) : null,
    getProjectPermissions(projectId, session.userId),
    loadLookupLists(RISK_ISSUE_LISTS, session),
  ]);

  // Cross-project leak guard: deep links to another project's record yield not-found.
  const selected = guardProjectScope(selectedRaw, projectId);

  const totalCount = rows[0]?.TotalCount ?? 0;
  const canCreate = allows("risks-issues:create");
  const canEdit = allows("risks-issues:update");
  const canDelete = allows("risks-issues:delete");
  const filtersActive = Boolean(listParams.q || flat.category || flat.status);

  const newItemLink = (
    <Link
      href={buildNewEntityHref(`/projects/${projectId}/risks-issues`, flat)}
      data-testid="new-risk-issue"
      className="inline-flex min-h-10 items-center rounded-md border border-line bg-surface px-4 text-sm font-medium text-ink hover:bg-surface-raised"
    >
      {messages.risksIssues.newItem}
    </Link>
  );

  return (
    <>
      <PageHeader title={messages.risksIssues.title} action={canCreate ? newItemLink : undefined} />
      <LookupListsScope {...lookup}>
        <div className="mt-3 flex flex-col flex-1">
          <RisksIssuesView
            projectId={projectId}
            canCreate={canCreate}
            rows={withRichViews(rows, ["Description", "MitigationPlan"])}
            totalCount={totalCount}
            page={listParams.page}
            initialView={initialViewOf(listParams.view, preference?.viewMode)}
            layout={preference?.layout}
            filtersActive={filtersActive}
            newItemAction={canCreate ? newItemLink : undefined}
          />
        </div>
        <RiskIssueSheet
          item={selected}
          isNew={isNew && canCreate}
          projectId={projectId}
          canEdit={canEdit}
          canDelete={canDelete}
        />
      </LookupListsScope>
    </>
  );
}
