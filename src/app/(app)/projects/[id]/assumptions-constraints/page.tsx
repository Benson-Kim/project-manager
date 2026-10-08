import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { auth } from "@/lib/auth/provider";
import { flattenSearchParams, parseListParams } from "@/lib/list-params";
import { messages } from "@/lib/messages";
import { getViewPreference } from "@/lib/repositories/view-preference";
import { orNotFound, orNull } from "@/lib/row-access";
import { getProjectPermissions } from "@/modules/projects/repository/project-access";
import { AssumptionConstraintSheet } from "@/modules/assumptions-constraints/components/assumption-constraint-sheet";
import { AssumptionConstraintsView } from "@/modules/assumptions-constraints/components/assumption-constraints-view";
import {
  getAssumptionConstraintById,
  listAssumptionConstraints,
} from "@/modules/assumptions-constraints/repository/assumption-constraints";
import { buildNewEntityHref, guardProjectScope } from "@/lib/project-page-helpers";
import { parseProjectId } from "../project-id";
import { LookupListsScope } from "@/modules/lookup-lists/components/lookup-lists-scope";
import { loadLookupLists } from "@/modules/lookup-lists/queries/load-lookup-lists";
import { ASSUMPTION_CONSTRAINT_LISTS } from "@/modules/assumptions-constraints/schemas/assumption-constraint";

export const metadata: Metadata = {
  title: `${messages.assumptionsConstraints.title} — ${messages.app.name}`,
};

/**
 * Assumptions & constraints list — project-scoped section under
 * /projects/[id]/assumptions-constraints; DataView + search + type filter;
 * detail/edit in the URL-synced Sheet (?id=<n> | ?id=new, ADR-0010).
 * Default sort: AssumptionConstraintId asc (proc default).
 */
export default async function AssumptionsConstraintsPage({
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
  const listParams = parseListParams(raw);

  const isNew = flat.id === "new";
  const selectedId = !isNew && flat.id ? Number(flat.id) : null;

  const filters = {
    type: flat.type ?? null,
  };

  const [rows, preferredView, selectedRaw, allows, lookup] = await Promise.all([
    orNotFound(listAssumptionConstraints(listParams, session.userId, projectId, filters)),
    getViewPreference(session.userId, "assumptions-constraints").catch(() => null),
    selectedId && Number.isInteger(selectedId) && selectedId > 0
      ? orNull(getAssumptionConstraintById(selectedId, session.userId))
      : null,
    getProjectPermissions(projectId, session.userId),
    loadLookupLists(ASSUMPTION_CONSTRAINT_LISTS, session),
  ]);

  // Cross-project leak guard: deep links to another project's record yield not-found.
  const selected = guardProjectScope(selectedRaw, projectId);

  const totalCount = rows[0]?.TotalCount ?? 0;
  const canCreate = allows("assumptions-constraints:create");
  const canEdit = allows("assumptions-constraints:update");
  const canDelete = allows("assumptions-constraints:delete");
  const filtersActive = Boolean(listParams.q || flat.type);

  const newItemLink = (
    <Link
      href={buildNewEntityHref(`/projects/${projectId}/assumptions-constraints`, flat)}
      data-testid="new-assumption-constraint"
      className="inline-flex min-h-10 items-center rounded-md border border-line bg-surface px-4 text-sm font-medium text-ink hover:bg-surface-raised"
    >
      {messages.assumptionsConstraints.newItem}
    </Link>
  );

  return (
    <>
      <PageHeader
        title={messages.assumptionsConstraints.title}
        action={canCreate ? newItemLink : undefined}
      />
      <LookupListsScope {...lookup}>
        <div className="mt-3 flex flex-col flex-1">
          <AssumptionConstraintsView
            projectId={projectId}
            canCreate={canCreate}
            rows={rows}
            totalCount={totalCount}
            page={listParams.page}
            initialView={listParams.view ?? preferredView ?? "grid"}
            filtersActive={filtersActive}
            newItemAction={canCreate ? newItemLink : undefined}
          />
        </div>
        <AssumptionConstraintSheet
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
