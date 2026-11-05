import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { withRichViews } from "@/components/ui/rich-text/rich-views";
import { auth } from "@/lib/auth/provider";
import { flattenSearchParams, initialViewOf, parseListParams } from "@/lib/list-params";
import { messages } from "@/lib/messages";
import { buildNewEntityHref, guardProjectScope } from "@/lib/project-page-helpers";
import { getListPreference } from "@/lib/repositories/view-preference";
import { orNotFound, orNull } from "@/lib/row-access";
import { DecisionSheet } from "@/modules/decisions/components/decision-sheet";
import { DecisionsView } from "@/modules/decisions/components/decisions-view";
import {
  getDecisionById,
  listDecisionOptions,
  listDecisions,
} from "@/modules/decisions/repository/decisions";
import { DECISION_LISTS, DECISION_SORT } from "@/modules/decisions/schemas/decision";
import { LookupListsScope } from "@/modules/lookup-lists/components/lookup-lists-scope";
import { loadLookupLists } from "@/modules/lookup-lists/queries/load-lookup-lists";
import { getProjectPermissions } from "@/modules/projects/repository/project-access";
import { listStakeholderOptions } from "@/modules/stakeholders/repository/stakeholder-options";
import { parseProjectId } from "../project-id";

export const metadata: Metadata = {
  title: `${messages.decisions.title} — ${messages.app.name}`,
};

const RICH_FIELDS = ["ProblemContext", "OptionsConsidered", "Rationale", "NextSteps"] as const;

/**
 * Decision log — project-scoped section under /projects/[id]/decisions;
 * DataView + search + status/impacted-area filters; detail/edit in the
 * URL-synced Sheet (?id=<n> | ?id=new, ADR-0010).
 * Default sort: the proc's own — newest decision first (ADR-0055).
 */
export default async function DecisionsPage({
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
  const listParams = parseListParams(raw, DECISION_SORT);

  const isNew = flat.id === "new";
  const rawId = !isNew && flat.id ? Number(flat.id) : null;
  // Guard against Infinity (e.g. "1e308") and non-integers before hitting the DB.
  const selectedId =
    rawId !== null && Number.isFinite(rawId) && Number.isInteger(rawId) && rawId > 0 ? rawId : null;

  // Empty-string filter params are coerced to null so the proc treats them as
  // "no filter" rather than filtering for the empty string.
  const filters = {
    status: flat.status?.trim() || null,
    impactedArea: flat.area?.trim() || null,
  };

  const [rows, preference, selectedRaw, allows, lookup, people, decisionOptions] =
    await Promise.all([
      orNotFound(listDecisions(listParams, session.userId, projectId, filters)),
      getListPreference(session.userId, "decisions").catch(() => null),
      selectedId ? orNull(getDecisionById(selectedId, session.userId)) : null,
      getProjectPermissions(projectId, session.userId),
      loadLookupLists(DECISION_LISTS, session),
      listStakeholderOptions(projectId, session.userId),
      listDecisionOptions(projectId, session.userId, selectedId),
    ]);

  // Cross-project leak guard: deep links to another project's record yield not-found.
  const selected = guardProjectScope(selectedRaw, projectId);

  const totalCount = rows[0]?.TotalCount ?? 0;
  const canCreate = allows("decisions:create");
  const canEdit = allows("decisions:update");
  const canDelete = allows("decisions:delete");
  const filtersActive = Boolean(listParams.q || flat.status || flat.area);

  const newItemLink = (
    <Link
      href={buildNewEntityHref(`/projects/${projectId}/decisions`, flat)}
      data-testid="new-decision"
      className="inline-flex min-h-10 items-center rounded-md border border-line bg-surface px-4 text-sm font-medium text-ink hover:bg-surface-raised"
    >
      {messages.decisions.newItem}
    </Link>
  );

  return (
    <>
      <PageHeader title={messages.decisions.title} action={canCreate ? newItemLink : undefined} />
      <LookupListsScope {...lookup}>
        <div className="mt-3 flex flex-col flex-1">
          <DecisionsView
            projectId={projectId}
            canCreate={canCreate}
            rows={withRichViews(rows, RICH_FIELDS)}
            people={people}
            totalCount={totalCount}
            page={listParams.page}
            initialView={initialViewOf(listParams.view, preference?.viewMode)}
            layout={preference?.layout}
            filtersActive={filtersActive}
            newItemAction={canCreate ? newItemLink : undefined}
          />
        </div>
        <DecisionSheet
          item={selected}
          isNew={isNew && canCreate}
          projectId={projectId}
          people={people}
          decisionOptions={decisionOptions}
          canEdit={canEdit}
          canDelete={canDelete}
        />
      </LookupListsScope>
    </>
  );
}
