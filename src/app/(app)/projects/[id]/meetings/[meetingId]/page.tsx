import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { UnsavedChangesScope } from "@/components/ui/form/unsaved-scope";
import { PageHeader } from "@/components/ui/page-header";
import { auth } from "@/lib/auth/provider";
import { messages } from "@/lib/messages";
import { guardProjectScope } from "@/lib/project-page-helpers";
import { orNotFound } from "@/lib/row-access";
import { MeetingHeaderForm } from "@/modules/meetings/components/meeting-header-form";
import { ParticipantsPanel } from "@/modules/meetings/components/participants-panel";
import { getMeetingRoster, getMeetingWorkspace } from "@/modules/meetings/repository/meetings";
import { getProjectPermissions } from "@/modules/projects/repository/project-access";
import { parseProjectId } from "../../project-id";

export const metadata: Metadata = {
  title: `${messages.meetings.title} — ${messages.app.name}`,
};

const M = messages.meetings;

/**
 * Meeting workspace — /projects/[id]/meetings/[meetingId], the ADR-0010
 * full-route exception: the header form, with the agenda and minutes in the
 * main column and the participants in the right-hand column (desktop; below
 * the header on smaller screens). Both forms share one unsaved-changes guard.
 * A meeting of another project, or one the actor can't open, is not found.
 */
export default async function MeetingPage({
  params,
}: {
  params: Promise<{ id: string; meetingId: string }>;
}) {
  const session = await auth.requireSession();
  const { id, meetingId: rawMeetingId } = await params;
  const projectId = parseProjectId(id);
  const meetingId = parseProjectId(rawMeetingId);
  if (projectId === null || meetingId === null) notFound();

  const [workspace, roster, allows] = await Promise.all([
    orNotFound(getMeetingWorkspace(meetingId, session.userId)),
    orNotFound(getMeetingRoster(meetingId, session.userId)),
    getProjectPermissions(projectId, session.userId),
  ]);
  const meeting = guardProjectScope(workspace.meeting, projectId);
  if (!meeting) notFound();

  const listHref = `/projects/${projectId}/meetings`;
  const title = meeting.Subject ?? messages.app.untitled;

  return (
    <div className="mx-auto w-full max-w-7xl">
      <Breadcrumbs items={[{ label: M.title, href: listHref }, { label: title }]} />
      <PageHeader title={title} />
      <UnsavedChangesScope>
        <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="flex min-w-0 flex-col gap-8">
            <MeetingHeaderForm
              key={meeting.RowVer}
              meeting={meeting}
              listHref={listHref}
              canEdit={allows("meetings:update")}
              canDelete={allows("meetings:delete")}
            />
            <section aria-labelledby="meeting-minutes-heading">
              <h2 id="meeting-minutes-heading" className="text-base font-medium text-ink">
                {M.minutes}
              </h2>
            </section>
          </div>
          <aside aria-labelledby="meeting-participants-heading" className="min-w-0">
            <ParticipantsPanel
              meetingId={meeting.MeetingId}
              projectId={projectId}
              roster={roster}
              canEdit={allows("meetings:update")}
              headingId="meeting-participants-heading"
            />
          </aside>
        </div>
      </UnsavedChangesScope>
    </div>
  );
}
