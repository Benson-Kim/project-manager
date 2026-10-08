import type { Metadata } from "next";
import { auth } from "@/lib/auth/provider";
import { flattenSearchParams, parseListParams } from "@/lib/list-params";
import { messages } from "@/lib/messages";
import { getViewPreference } from "@/lib/repositories/view-preference";
import { orNull } from "@/lib/row-access";
import { DailyActivitiesView } from "@/modules/daily-activities/components/daily-activities-view";
import { DailyActivitySheet } from "@/modules/daily-activities/components/daily-activity-sheet";
import {
  getDailyActivityById,
  listDailyActivities,
  type DailyActivityListFilters,
} from "@/modules/daily-activities/repository/daily-activities";
import { LookupListsScope } from "@/modules/lookup-lists/components/lookup-lists-scope";
import { loadLookupLists } from "@/modules/lookup-lists/queries/load-lookup-lists";
import { DAILY_ACTIVITY_LISTS } from "@/modules/daily-activities/schemas/daily-activity";
import { getProjectPermissions } from "@/modules/projects/repository/project-access";

export const metadata: Metadata = {
  title: `${messages.dailyActivities.title} — ${messages.app.name}`,
};

/**
 * Global daily activities page (top-level nav, /daily-activities): cross-project
 * view of all activities for the current user. Daily activities may be
 * project-unscoped (ProjectId nullable via migration 014), so creation is
 * allowed here via ?id=new when the user has daily-activities:create permission.
 * Filter params (@ActivityStatusId, @TaskType) forwarded server-side per module
 * gap closure (#19).
 */
export default async function GlobalDailyActivitiesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth.requireSession();
  const raw = await searchParams;
  const flat = flattenSearchParams(raw);
  const listParams = parseListParams(raw);
  const effectiveParams = {
    ...listParams,
    sort: listParams.sort ?? "RequestDate",
    dir: (listParams.dir ?? "desc") as "asc" | "desc",
  };

  const isNew = flat.id === "new";
  const selectedId = flat.id && !isNew ? Number(flat.id) : null;

  const filters: DailyActivityListFilters = {
    activityStatusId: flat.statusId ? Number(flat.statusId) : null,
    taskType: flat.taskType ?? null,
  };

  const [rows, preferredView, lookup, projectless, selected] = await Promise.all([
    listDailyActivities(effectiveParams, session.userId, null, undefined, filters),
    getViewPreference(session.userId, "daily-activities").catch(() => null),
    loadLookupLists(DAILY_ACTIVITY_LISTS, session),
    // The new-entry row adds project-less activities (the shared space, ADR-0021).
    getProjectPermissions(null, session.userId),
    selectedId && Number.isInteger(selectedId) && selectedId > 0
      ? orNull(getDailyActivityById(selectedId, session.userId))
      : null,
  ]);
  // New activities start project-less; an open activity follows its own project (ADR-0021).
  const allows = await getProjectPermissions(selected?.ProjectId ?? null, session.userId);

  const totalCount = rows[0]?.TotalCount ?? 0;
  const canCreate = allows("daily-activities:create");
  const canEdit = allows("daily-activities:update");
  const canDelete = allows("daily-activities:delete");
  const filtersActive = Boolean(effectiveParams.q || flat.statusId || flat.taskType);

  return (
    <>
      <LookupListsScope {...lookup}>
        <div className="mt-3 flex flex-col flex-1">
          <DailyActivitiesView
            rows={rows}
            totalCount={totalCount}
            page={effectiveParams.page}
            initialView={effectiveParams.view ?? preferredView ?? "list"}
            filtersActive={filtersActive}
            projectId={null}
            canCreate={projectless("daily-activities:create")}
          />
        </div>
        {/* Sheet: create (project-unscoped, projectId=null) or edit/view */}
        <DailyActivitySheet
          activity={selected}
          isNew={isNew && canCreate}
          projectId={selected?.ProjectId ?? null}
          canEdit={canEdit}
          canDelete={canDelete}
        />
      </LookupListsScope>
    </>
  );
}
