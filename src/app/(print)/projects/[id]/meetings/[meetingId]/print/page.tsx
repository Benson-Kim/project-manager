import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Fragment } from "react";
import { parseProjectId } from "@/app/(app)/projects/[id]/project-id";
import { previewText } from "@/components/ui/data-view/datasheet";
import { RichTextView } from "@/components/ui/rich-text/rich-text-view";
import { auth } from "@/lib/auth/provider";
import { formatDate } from "@/lib/format";
import { messages } from "@/lib/messages";
import { guardProjectScope } from "@/lib/project-page-helpers";
import { orNotFound } from "@/lib/row-access";
import { PrintMinutesButton } from "@/modules/meetings/components/print-minutes-button";
import { getMeetingWorkspace } from "@/modules/meetings/repository/meetings";
import { meetingTimes } from "@/modules/meetings/schemas/meeting-display";
import {
  buildMinutes,
  carriedOverActions,
  itemName,
  todayIso,
  type ActionNode,
  type CarriedOver,
} from "@/modules/meetings/schemas/minutes";

const M = messages.meetings;

export const metadata: Metadata = {
  title: `${M.printView} — ${messages.app.name}`,
};

function Details({ items }: { items: Array<[string, string | null]> }) {
  const filled = items.filter(([, value]) => value);
  if (filled.length === 0) return null;
  return (
    <dl className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2 print:grid-cols-2">
      {filled.map(([label, value]) => (
        <div key={label} className="flex flex-col">
          <dt className="text-ink-muted">{label}</dt>
          <dd className="wrap-anywhere">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function RichBlock({ title, html }: { title: string; html: string | null }) {
  if (!html) return null;
  return (
    <section className="flex flex-col gap-1">
      <h2 className="text-base font-semibold">{title}</h2>
      <RichTextView html={html} className="text-sm" />
    </section>
  );
}

function People({ title, people, testId }: { title: string; people: string[]; testId: string }) {
  return (
    <section className="flex flex-col gap-1" data-testid={testId}>
      <h2 className="text-base font-semibold">{title}</h2>
      {people.length === 0 ? (
        <p className="text-sm text-ink-muted">{M.noneRecorded}</p>
      ) : (
        <ul className="flex flex-col gap-0.5 text-sm">
          {people.map((label, index) => (
            <li key={`${index}-${label}`} className="wrap-anywhere">
              {label}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * The actions of one parent, each followed by its follow-ups indented under it
 * (ADR-0043), so the printed minutes show the same one-to-many the workspace
 * edits.
 */
function ActionsTable({ actions, name }: { actions: ActionNode[]; name: string }) {
  if (actions.length === 0) return null;
  return (
    <table className="w-full border-collapse text-sm" data-testid="print-actions">
      <caption className="sr-only">{M.actionsOf(name)}</caption>
      <thead>
        <tr className="border-b border-line text-left">
          <th scope="col" className="py-1 pr-3 font-medium">
            {M.action}
          </th>
          <th scope="col" className="py-1 pr-3 font-medium">
            {M.personResponsible}
          </th>
          <th scope="col" className="py-1 pr-3 font-medium whitespace-nowrap">
            {M.dueDate}
          </th>
          <th scope="col" className="py-1 font-medium whitespace-nowrap">
            {M.status}
          </th>
        </tr>
      </thead>
      <tbody>
        {actions.map((node) => (
          <Fragment key={node.action.MeetingActionItemId}>
            <tr className="border-b border-line align-top">
              <td className="py-1 pr-3 wrap-anywhere">{node.action.Action}</td>
              <td className="py-1 pr-3 wrap-anywhere">{node.action.AssigneeName}</td>
              <td className="py-1 pr-3 whitespace-nowrap tabular-nums">
                {formatDate(node.action.DueDate)}
              </td>
              <td className="py-1 whitespace-nowrap">{M.actionStatus[node.action.Status]}</td>
            </tr>
            {node.followUps.map((followUp) => (
              <tr
                key={followUp.MeetingActionFollowUpId}
                data-testid="print-follow-up"
                className="border-b border-line align-top text-ink-muted"
              >
                <td className="py-1 pr-3 pl-4 wrap-anywhere">
                  <span className="pr-1">{M.followUp}:</span>
                  {followUp.FollowUp}
                </td>
                <td className="py-1 pr-3 wrap-anywhere">{followUp.AssigneeName}</td>
                <td className="py-1 pr-3 whitespace-nowrap tabular-nums">
                  {formatDate(followUp.DueDate)}
                </td>
                <td className="py-1 whitespace-nowrap tabular-nums">
                  {formatDate(followUp.FollowUpDate)}
                </td>
              </tr>
            ))}
          </Fragment>
        ))}
      </tbody>
    </table>
  );
}

/** The unfinished actions this meeting inherits from the project's earlier ones (ADR-0043). */
function CarriedOverTable({ rows }: { rows: CarriedOver[] }) {
  if (rows.length === 0) return null;
  return (
    <section className="flex flex-col gap-1" data-testid="print-carried-over">
      <h2 className="text-base font-semibold">{M.carriedOver}</h2>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-left">
            <th scope="col" className="py-1 pr-3 font-medium">
              {M.action}
            </th>
            <th scope="col" className="py-1 pr-3 font-medium">
              {M.personResponsible}
            </th>
            <th scope="col" className="py-1 pr-3 font-medium whitespace-nowrap">
              {M.dueDate}
            </th>
            <th scope="col" className="py-1 font-medium whitespace-nowrap">
              {M.status}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ action }) => (
            <tr key={action.MeetingActionItemId} className="border-b border-line align-top">
              <td className="py-1 pr-3 wrap-anywhere">
                {action.Action}
                <span className="block text-ink-muted">
                  {M.carriedFrom(action.FromSubject ?? messages.app.untitled)}
                </span>
              </td>
              <td className="py-1 pr-3 wrap-anywhere">{action.AssigneeName}</td>
              <td className="py-1 pr-3 whitespace-nowrap tabular-nums">
                {formatDate(action.DueDate)}
              </td>
              <td className="py-1 whitespace-nowrap">{M.actionStatus[action.Status]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/**
 * The printed minutes (Access rptMeetingMinutes, with subrptMeetingAttendees
 * and subrptMeetingApologies) — /projects/[id]/meetings/[meetingId]/print,
 * outside the app shell: the header fields, who was present and who sent
 * apologies, the agenda with its discussion points and actions, then the
 * conclusion, follow-up action and next meeting. One workspace read, so the
 * page is one consistent snapshot. "Print minutes" is window.print over the
 * print stylesheet (portrait A4), in the browser and the desktop app alike.
 * Access is the workspace's: a meeting of another project, or one the actor
 * can't open, is not found.
 */
export default async function MeetingMinutesPrintPage({
  params,
}: {
  params: Promise<{ id: string; meetingId: string }>;
}) {
  const session = await auth.requireSession();
  const { id, meetingId: rawMeetingId } = await params;
  const projectId = parseProjectId(id);
  const meetingId = parseProjectId(rawMeetingId);
  if (projectId === null || meetingId === null) notFound();

  const workspace = await orNotFound(getMeetingWorkspace(meetingId, session.userId));
  const meeting = guardProjectScope(workspace.meeting, projectId);
  if (!meeting) notFound();

  const title = meeting.Subject ?? messages.app.untitled;
  const present = workspace.participants.filter((p) => !p.IsApology).map((p) => p.Label);
  const apologies = workspace.participants.filter((p) => p.IsApology).map((p) => p.Label);
  const agenda = buildMinutes(workspace);
  const carried = carriedOverActions(workspace.carriedOver, todayIso());

  return (
    <main
      data-print-page="minutes"
      className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 text-ink sm:px-6 print:max-w-none print:p-0"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link
          href={`/projects/${projectId}/meetings/${meeting.MeetingId}`}
          className="inline-flex min-h-11 items-center text-sm font-medium text-accent"
        >
          {M.backToMeeting}
        </Link>
        <PrintMinutesButton />
      </div>

      <div className="flex flex-col gap-6" data-testid="printed-minutes">
        <div className="flex flex-col gap-1">
          <p className="text-sm text-ink-muted">{M.minutesOf}</p>
          <h1 className="text-2xl font-semibold wrap-anywhere">{title}</h1>
        </div>

        <Details
          items={[
            [M.startDate, formatDate(meeting.StartDate)],
            [M.time, meetingTimes(meeting.StartTime, meeting.EndTime)],
            [M.location, meeting.Location],
            [M.dateReceived, formatDate(meeting.DateReceived)],
          ]}
        />
        <RichBlock title={M.objective} html={meeting.Objective} />
        <RichBlock title={M.description} html={meeting.Description} />

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 print:grid-cols-2">
          <People title={M.present} people={present} testId="print-present" />
          <People title={M.apologies} people={apologies} testId="print-apologies" />
        </div>

        <CarriedOverTable rows={carried} />

        <section className="flex flex-col gap-3">
          <h2 className="text-base font-semibold">{M.agenda}</h2>
          {agenda.length === 0 ? (
            <p className="text-sm text-ink-muted">{M.noAgenda}</p>
          ) : (
            <ol className="flex flex-col gap-5">
              {agenda.map((node, index) => {
                const position = index + 1;
                const name = itemName(node.item.AgendaItem, M.agendaItem);
                return (
                  <li
                    key={node.item.MeetingAgendaItemId}
                    data-testid="print-agenda-item"
                    className="flex flex-col gap-3"
                  >
                    <h3 className="flex gap-2 font-semibold wrap-anywhere">
                      <span className="tabular-nums">{position}.</span>{" "}
                      <span>{node.item.AgendaItem}</span>
                    </h3>
                    {node.points.length > 0 ? (
                      <ol className="flex flex-col gap-3 pl-6">
                        {node.points.map((child, pointIndex) => (
                          <li
                            key={child.point.MeetingDiscussionPointId}
                            data-testid="print-discussion-point"
                            className="flex flex-col gap-2"
                          >
                            <div className="flex gap-2 text-sm">
                              <span className="shrink-0 text-ink-muted tabular-nums">
                                {`${position}.${pointIndex + 1}`}
                              </span>{" "}
                              <RichTextView
                                html={child.point.DiscussionPoint}
                                className="min-w-0 flex-1"
                              />
                            </div>
                            <ActionsTable
                              actions={child.actions}
                              name={itemName(
                                previewText(child.point.DiscussionPoint),
                                M.discussionPoint,
                              )}
                            />
                          </li>
                        ))}
                      </ol>
                    ) : null}
                    <div className="pl-6">
                      <ActionsTable actions={node.actions} name={name} />
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <RichBlock title={M.conclusion} html={meeting.Conclusion} />
        <Details
          items={[
            [M.followupAction, meeting.FollowupAction],
            [M.nextMeeting, formatDate(meeting.NextMeeting)],
          ]}
        />
      </div>
    </main>
  );
}
