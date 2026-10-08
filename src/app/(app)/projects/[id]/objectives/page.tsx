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
import { ObjectiveSheet } from "@/modules/objectives/components/objective-sheet";
import { ObjectivesView } from "@/modules/objectives/components/objectives-view";
import { listObjectives, getObjectiveById } from "@/modules/objectives/repository/objectives";
import { buildNewEntityHref, guardProjectScope } from "@/lib/project-page-helpers";
import { parseProjectId } from "../project-id";

export const metadata: Metadata = {
  title: `${messages.objectives.title} — ${messages.app.name}`,
};

/**
 * Objectives list — project-scoped section under /projects/[id]/objectives;
 * DataView + search, detail/edit in the URL-synced Sheet (?id=<n> | ?id=new).
 * Default sort: ObjectiveId asc (insertion order reflects creation sequence).
 */
export default async function ObjectivesPage({
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

  const [rows, preferredView, selectedRaw, allows] = await Promise.all([
    orNotFound(listObjectives(listParams, session.userId, projectId, undefined)),
    getViewPreference(session.userId, "objectives").catch(() => null),
    selectedId && Number.isInteger(selectedId) && selectedId > 0
      ? orNull(getObjectiveById(selectedId, session.userId))
      : null,
    getProjectPermissions(projectId, session.userId),
  ]);

  // A deep link to an objective from another project is treated as not found.
  const selected = guardProjectScope(selectedRaw, projectId);

  const totalCount = rows[0]?.TotalCount ?? 0;
  const canCreate = allows("objectives:create");
  const canEdit = allows("objectives:update");
  const canDelete = allows("objectives:delete");
  const filtersActive = Boolean(listParams.q);

  const newObjectiveLink = (
    <Link
      href={buildNewEntityHref(`/projects/${projectId}/objectives`, flat)}
      data-testid="new-objective"
      className="inline-flex min-h-10 items-center rounded-md border border-line bg-surface px-4 text-sm font-medium text-ink hover:bg-surface-raised"
    >
      {messages.objectives.newObjective}
    </Link>
  );

  return (
    <>
      <PageHeader
        title={messages.objectives.title}
        action={canCreate ? newObjectiveLink : undefined}
      />
      <div className="mt-3 flex flex-col flex-1">
        <ObjectivesView
          projectId={projectId}
          canCreate={canCreate}
          rows={rows}
          totalCount={totalCount}
          page={listParams.page}
          initialView={listParams.view ?? preferredView ?? "grid"}
          filtersActive={filtersActive}
          newObjectiveAction={canCreate ? newObjectiveLink : undefined}
        />
      </div>
      <ObjectiveSheet
        objective={selected}
        isNew={isNew && canCreate}
        projectId={projectId}
        canEdit={canEdit}
        canDelete={canDelete}
      />
    </>
  );
}
