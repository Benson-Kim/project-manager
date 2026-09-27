import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { auth } from "@/lib/auth/provider";
import { parseListParams } from "@/lib/list-params";
import { messages } from "@/lib/messages";
import { getViewPreference } from "@/lib/repositories/view-preference";
import { DailyActivitiesView } from "@/modules/daily-activities/components/daily-activities-view";
import {
  listActivityStatuses,
  listDailyActivities,
} from "@/modules/daily-activities/repository/daily-activities";

export const metadata: Metadata = {
  title: `${messages.dailyActivities.title} — ${messages.app.name}`,
};

/**
 * Global daily activities page (top-level nav, /daily-activities): cross-project
 * read-only view of all activities for the current user. Creation is always done
 * inside a project — there is no new-activity action here.
 */
export default async function GlobalDailyActivitiesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth.requireSession();
  const raw = await searchParams;
  const listParams = parseListParams(raw);
  const effectiveParams = {
    ...listParams,
    sort: listParams.sort ?? "RequestDate",
    dir: (listParams.dir ?? "desc") as "asc" | "desc",
  };

  const [rows, preferredView, statuses] = await Promise.all([
    listDailyActivities(effectiveParams, session.userId, null),
    getViewPreference(session.userId, "daily-activities").catch(() => null),
    listActivityStatuses(),
  ]);

  const totalCount = rows[0]?.TotalCount ?? 0;
  const filtersActive = Boolean(effectiveParams.q);

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
    </>
  );
}
