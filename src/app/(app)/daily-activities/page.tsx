import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { auth } from "@/lib/auth/provider";
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
 * view of all activities for the current user. Creation requires a project —
 * the sheet opens read-only (canEdit=false, canDelete=false). Filter params
 * (@ActivityStatusId, @TaskType) forwarded server-side per module gap closure (#19).
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

  // Creation requires a project — not available from global page.
  const selectedId = flat.id && flat.id !== "new" ? Number(flat.id) : null;

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
  const filtersActive = Boolean(effectiveParams.q || flat.statusId || flat.taskType);

  return (
    <>
      <PageHeader title={messages.dailyActivities.title} />
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
      {/* Sheet: read-only in global context — creation is project-scoped */}
      <DailyActivitySheet
        activity={selected}
        isNew={false}
        projectId={selected?.ProjectId ?? 0}
        statuses={statuses}
        canEdit={false}
        canDelete={false}
      />
    </>
  );
}
