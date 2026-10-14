import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { RichTextView } from "@/components/ui/rich-text/rich-text-view";
import { auth } from "@/lib/auth/provider";
import { flattenSearchParams, initialViewOf, parseListParams } from "@/lib/list-params";
import { messages } from "@/lib/messages";
import { getListPreference } from "@/lib/repositories/view-preference";
import { orNotFound } from "@/lib/row-access";
import { MeetingsView, type MeetingListItem } from "@/modules/meetings/components/meetings-view";
import { NewMeetingButton } from "@/modules/meetings/components/new-meeting-button";
import { listMeetings } from "@/modules/meetings/repository/meetings";
import { meetingDateFilter } from "@/modules/meetings/schemas/meeting-display";
import { getProjectPermissions } from "@/modules/projects/repository/project-access";
import { parseProjectId } from "../project-id";

export const metadata: Metadata = {
  title: `${messages.meetings.title} — ${messages.app.name}`,
};

/**
 * Meetings list — /projects/[id]/meetings (module #10, checklist row 53): a
 * datasheet newest first, search over title, location and objective, and a
 * meeting-date range (?from=, ?to=). "New meeting" creates a draft and opens
 * its workspace; a row opens the workspace too (ADR-0010 full route).
 */
export default async function MeetingsPage({
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
  const dateFrom = meetingDateFilter(flat.from);
  const dateTo = meetingDateFilter(flat.to);

  const [rows, preference, allows] = await Promise.all([
    orNotFound(listMeetings(projectId, listParams, session.userId, { dateFrom, dateTo })),
    getListPreference(session.userId, "meetings").catch(() => null),
    getProjectPermissions(projectId, session.userId),
  ]);

  // Rich text renders here, on the server, where the sanitiser lives (ADR-0025).
  const items: MeetingListItem[] = rows.map((row) => ({
    ...row,
    views: { Objective: { html: row.Objective, node: <RichTextView html={row.Objective} /> } },
  }));

  const canCreate = allows("meetings:create");
  const filtersActive = Boolean(listParams.q || dateFrom || dateTo);
  const newMeeting = canCreate ? <NewMeetingButton projectId={projectId} /> : undefined;

  return (
    <>
      <PageHeader title={messages.meetings.title} action={newMeeting} />
      <div className="mt-3 flex flex-1 flex-col">
        <MeetingsView
          projectId={projectId}
          canCreate={canCreate}
          rows={items}
          totalCount={rows[0]?.TotalCount ?? 0}
          page={listParams.page}
          initialView={initialViewOf(listParams.view, preference?.viewMode)}
          layout={preference?.layout}
          filtersActive={filtersActive}
          newItemAction={newMeeting}
        />
      </div>
    </>
  );
}
