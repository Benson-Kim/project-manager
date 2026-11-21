import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { UnsavedChangesScope } from "@/components/ui/form/unsaved-scope";
import { PrintLink } from "@/components/ui/print-link";
import { PANEL_BODY, PANEL_SHELL } from "@/components/ui/panel-styles";
import { RichTextView } from "@/components/ui/rich-text/rich-text-view";
import { auth } from "@/lib/auth/provider";
import { messages } from "@/lib/messages";
import { guardProjectScope } from "@/lib/project-page-helpers";
import { orNotFound } from "@/lib/row-access";
import {
  MeetingFormScope,
  MeetingHeaderForm,
  MeetingNotesForm,
} from "@/modules/meetings/components/meeting-header-form";
import { MinutesEditor } from "@/modules/meetings/components/minutes-editor";
import { GOVERNANCE_LOG_KINDS, governanceLogPermission } from "@/modules/meetings/governance-logs";
import { listDeliverableOptions } from "@/modules/key-deliverables/repository/key-deliverables";
import { ParticipantsPanel } from "@/modules/meetings/components/participants-panel";
import { getMeetingRoster, getMeetingWorkspace } from "@/modules/meetings/repository/meetings";
import { todayIso } from "@/modules/meetings/schemas/minutes";
import { getProjectPermissions } from "@/modules/projects/repository/project-access";
import { parseProjectId } from "../../project-id";

export const metadata: Metadata = {
  title: `${messages.meetings.title} — ${messages.app.name}`,
};

const M = messages.meetings;

/**
 * Meeting workspace — /projects/[id]/meetings/[meetingId], the ADR-0010
 * full-route exception: one column — the header form, then who was present and
 * who sent apologies directly under its Location field, then the agenda and
 * minutes. Every form on the page shares one unsaved-changes guard. A meeting
 * of another project, or one the actor can't open, is not found.
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
  const taskOptions =
    allows("meetings:update") && allows("key-deliverables:read")
      ? await listDeliverableOptions(projectId, session.userId)
      : [];

  const listHref = `/projects/${projectId}/meetings`;
  const title = meeting.Subject ?? messages.app.untitled;
  const pointViews = Object.fromEntries(
    workspace.discussionPoints.map((point) => [
      point.MeetingDiscussionPointId,
      { html: point.DiscussionPoint, node: <RichTextView html={point.DiscussionPoint} /> },
    ]),
  );

  return (
    <div className="mx-auto w-full max-w-7xl">
      <Breadcrumbs items={[{ label: M.title, href: listHref }, { label: title }]} />
      <UnsavedChangesScope>
        <MeetingFormScope meeting={meeting} canEdit={allows("meetings:update")}>
          <div className="flex flex-col gap-8">
            <div className="flex min-w-0 flex-col gap-8">
              <MeetingHeaderForm listHref={listHref} canDelete={allows("meetings:delete")} />
              {/*
              Present and apologies, directly under the header form's last
              field, Location. It was a right-hand
              column before; it stays a form of its own, with its own stamped
              save, so it cannot move inside the header form.
            */}
              <section aria-labelledby="meeting-participants-heading" className="min-w-0">
                <ParticipantsPanel
                  meetingId={meeting.MeetingId}
                  projectId={projectId}
                  roster={roster}
                  canEdit={allows("meetings:update")}
                  headingId="meeting-participants-heading"
                />
              </section>
              <section aria-labelledby="meeting-minutes-heading" className={PANEL_SHELL}>
                <div className="flex items-center justify-between border-b border-line px-4 py-3">
                  <h2
                    id="meeting-minutes-heading"
                    className="text-xs font-semibold uppercase tracking-wide text-ink-muted"
                  >
                    {M.minutes}
                  </h2>
                  <PrintLink
                    href={`${listHref}/${meeting.MeetingId}/print`}
                    testId="minutes-print-link"
                    label={M.printView}
                  />
                </div>
                <div className={PANEL_BODY}>
                  <MinutesEditor
                    workspace={workspace}
                    pointViews={pointViews}
                    roster={roster.entries}
                    today={todayIso()}
                    meetingsHref={listHref}
                    canCreate={allows("meetings:create")}
                    canEdit={allows("meetings:update")}
                    canDelete={allows("meetings:delete")}
                    canLogDecision={allows("meetings:update") && allows("decisions:create")}
                    decisionsHref={`/projects/${projectId}/decisions`}
                    canLogAssumption={
                      allows("meetings:update") && allows("assumptions-constraints:create")
                    }
                    assumptionsHref={`/projects/${projectId}/assumptions-constraints`}
                    projectId={projectId}
                    canAddStakeholder={allows("stakeholders:create")}
                    logKinds={
                      allows("meetings:update")
                        ? GOVERNANCE_LOG_KINDS.filter(
                            (kind) =>
                              allows(governanceLogPermission(kind, "create")) &&
                              allows(governanceLogPermission(kind, "update")),
                          )
                        : []
                    }
                    notes={<MeetingNotesForm />}
                    taskOptions={taskOptions}
                  />
                </div>
              </section>
            </div>
          </div>
        </MeetingFormScope>
      </UnsavedChangesScope>
    </div>
  );
}
