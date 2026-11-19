"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatDate } from "@/lib/format";
import { messages } from "@/lib/messages";
import { readTaskMeetingActionsAction } from "../actions";
import type { TaskMeetingAction } from "../repository/task-meeting-actions";

const M = messages.meetings;

/**
 * The meeting action items that point at this WBS task, each opening its
 * meeting. Shows nothing when there are none or the user cannot read meetings.
 */
export function TaskMeetingActions({
  projectId,
  keyDeliverableId,
}: {
  projectId: number;
  keyDeliverableId: number;
}) {
  const [rows, setRows] = useState<TaskMeetingAction[]>([]);

  useEffect(() => {
    let live = true;
    readTaskMeetingActionsAction({ keyDeliverableId }).then((result) => {
      if (live) setRows(result.ok ? result.data : []);
    });
    return () => {
      live = false;
    };
  }, [keyDeliverableId]);

  if (rows.length === 0) return null;
  return (
    <div className="flex min-w-0 flex-col gap-1" data-testid="wbs-details-meeting-actions">
      <h4 className="text-xs font-medium text-ink-muted">{M.taskMeetingActions}</h4>
      <ul className="flex flex-col gap-1 text-sm">
        {rows.map((row) => (
          <li key={row.MeetingActionItemId} className="flex flex-wrap items-baseline gap-x-2">
            <Link
              href={`/projects/${projectId}/meetings/${row.MeetingId}`}
              className="text-accent wrap-anywhere hover:underline"
            >
              {row.Action || M.action}
            </Link>
            <span className="text-xs text-ink-muted wrap-anywhere">
              {[row.MeetingSubject ?? messages.app.untitled, formatDate(row.MeetingDate)]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
