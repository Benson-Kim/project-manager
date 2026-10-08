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
import { DailyActivitySheet } from "@/modules/daily-activities/components/daily-activity-sheet";
import { DailyActivitiesView } from "@/modules/daily-activities/components/daily-activities-view";
import {
  getDailyActivityById,
  listDailyActivities,
  type DailyActivityListFilters,
} from "@/modules/daily-activities/repository/daily-activities";
import { LookupListsScope } from "@/modules/lookup-lists/components/lookup-lists-scope";
import { loadLookupLists } from "@/modules/lookup-lists/queries/load-lookup-lists";
import { DAILY_ACTIVITY_LISTS } from "@/modules/daily-activities/schemas/daily-activity";
import { buildNewEntityHref, guardProjectScope } from "@/lib/project-page-helpers";
import { parseProjectId } from "../project-id";

export const metadata: Metadata = {
  title: `${messages.dailyActivities.title} — ${messages.app.name}`,
};

/**
 * Daily Activities list (project-scoped section under
 * /projects/[id]/daily-activities, ADR-0018); DataView + search + status/type
 * filters; detail/edit in the URL-synced Sheet (?id=<n> | ?id=new, ADR-0010).
 * Default sort: RequestDate desc (most recent first).
 */
export default async function DailyActivitiesPage({
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
  const effectiveParams = {
    ...listParams,
    sort: listParams.sort ?? "RequestDate",
    dir: (listParams.dir ?? "desc") as "asc" | "desc",
  };

  const isNew = flat.id === "new";
  const selectedId = !isNew && flat.id ? Number(flat.id) : null;

  const filters: DailyActivityListFilters = {
    activityStatusId: flat.statusId ? Number(flat.statusId) : null,
    taskType: flat.taskType ?? null,
  };

  const [rows, preferredView, lookup, selectedRaw, allows] = await Promise.all([
    orNotFound(listDailyActivities(effectiveParams, session.userId, projectId, undefined, filters)),
    getViewPreference(session.userId, "daily-activities").catch(() => null),
    loadLookupLists(DAILY_ACTIVITY_LISTS, session),
    selectedId && Number.isInteger(selectedId) && selectedId > 0
      ? orNull(getDailyActivityById(selectedId, session.userId))
      : null,
    getProjectPermissions(projectId, session.userId),
  ]);

  // A deep link to an activity from another project is treated as not found.
  const selected = guardProjectScope(selectedRaw, projectId);

  const totalCount = rows[0]?.TotalCount ?? 0;
  const canCreate = allows("daily-activities:create");
  const canEdit = allows("daily-activities:update");
  const canDelete = allows("daily-activities:delete");
  const canCreateTodo = allows("todo-items:create");
  const filtersActive = Boolean(effectiveParams.q || flat.statusId || flat.taskType);

  const newActivityLink = (
    <Link
      href={buildNewEntityHref(`/projects/${projectId}/daily-activities`, flat)}
      data-testid="new-daily-activity"
      className="inline-flex min-h-10 items-center rounded-md border border-line bg-surface px-4 text-sm font-medium text-ink hover:bg-surface-raised"
    >
      {messages.dailyActivities.newActivity}
    </Link>
  );

  return (
    <>
      <PageHeader
        title={messages.dailyActivities.title}
        action={canCreate ? newActivityLink : undefined}
      />
      <LookupListsScope {...lookup}>
        <div className="mt-3 flex flex-col flex-1">
          <DailyActivitiesView
            rows={rows}
            totalCount={totalCount}
            page={effectiveParams.page}
            initialView={effectiveParams.view ?? preferredView ?? "grid"}
            filtersActive={filtersActive}
            projectId={projectId}
            canCreate={canCreate}
            newActivityAction={canCreate ? newActivityLink : undefined}
          />
        </div>
        <DailyActivitySheet
          activity={selected}
          isNew={isNew && canCreate}
          projectId={projectId}
          canEdit={canEdit}
          canDelete={canDelete}
          canCreateTodo={canCreateTodo}
        />
      </LookupListsScope>
    </>
  );
}
