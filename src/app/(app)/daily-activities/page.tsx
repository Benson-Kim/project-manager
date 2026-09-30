import type { Metadata } from "next";
import { auth } from "@/lib/auth/provider";
import { can } from "@/lib/auth/rbac";
import { flattenSearchParams, parseListParams } from "@/lib/list-params";
import { messages } from "@/lib/messages";
import { getViewPreference } from "@/lib/repositories/view-preference";
import { AppError } from "@/lib/errors";
import { DailyActivitiesView } from "@/modules/daily-activities/components/daily-activities-view";
import { DailyActivitySheet } from "@/modules/daily-activities/components/daily-activity-sheet";
import {
  getDailyActivityById,
  listActivityStatuses,
  listDailyActivities,
  type DailyActivityListFilters,
} from "@/modules/daily-activities/repository/daily-activities";

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

  const [rows, preferredView, statuses, selected] = await Promise.all([
    listDailyActivities(effectiveParams, session.userId, null, undefined, filters),
    getViewPreference(session.userId, "daily-activities").catch(() => null),
    listActivityStatuses(),
    selectedId && Number.isInteger(selectedId) && selectedId > 0
      ? getDailyActivityById(selectedId, session.userId).catch((err) => {
          if (err instanceof AppError && err.code === "NOT_FOUND") return null;
          throw err;
        })
      : Promise.resolve(null),
  ]);

  const totalCount = rows[0]?.TotalCount ?? 0;
  const canCreate = can(session.role, "daily-activities:create");
  const canEdit = can(session.role, "daily-activities:update");
  const canDelete = can(session.role, "daily-activities:delete");
  const filtersActive = Boolean(effectiveParams.q || flat.statusId || flat.taskType);

  return (
    <>
      <div className="mt-3 flex flex-col flex-1">
        <DailyActivitiesView
          rows={rows}
          totalCount={totalCount}
          page={effectiveParams.page}
          initialView={effectiveParams.view ?? preferredView ?? "list"}
          filtersActive={filtersActive}
          statuses={statuses}
        />
      </div>
      {/* Sheet: create (project-unscoped, projectId=null) or edit/view */}
      <DailyActivitySheet
        activity={selected}
        isNew={isNew && canCreate}
        projectId={selected?.ProjectId ?? null}
        statuses={statuses}
        canEdit={canEdit}
        canDelete={canDelete}
      />
    </>
  );
}
