"use client";

import { useSearchParams } from "next/navigation";
import { GanttChart } from "./gantt-chart";
import { GanttToolbar } from "./gantt-toolbar";
import type { AssigneeEntry, GanttBar } from "../schemas/key-deliverable";

// ---------------------------------------------------------------------------
// Client filter controller
// ---------------------------------------------------------------------------

interface GanttClientProps {
  allBars: GanttBar[];
  projectId: number;
  /** Unique assignees (by id) across all bars — for the filter select. */
  allAssignees: AssigneeEntry[];
}

/**
 * GanttClient: "use client" wrapper that owns:
 *  - URL-synced status / priority / assignee filters applied client-side
 *
 * GanttChart renders detail values (dates, status, priority) inline in each
 * bar row — no hover tooltip is used (no-tooltips UI rule; touch inaccessible).
 */
export function GanttClient({ allBars, projectId, allAssignees }: GanttClientProps) {
  const searchParams = useSearchParams();

  // ---- filter ----------------------------------------------------------------
  const status = searchParams.get("status") ?? "";
  const priority = searchParams.get("priority") ?? "";
  // URL carries the numeric stakeholder id as a string for exact identity matching.
  const assigneeId = searchParams.get("assignee") ? Number(searchParams.get("assignee")) : null;

  const bars = allBars.filter((b) => {
    if (status && b.status !== status) return false;
    if (priority && b.priority !== priority) return false;
    if (assigneeId !== null) {
      if (!b.assignees.some((a) => a.id === assigneeId)) return false;
    }
    return true;
  });

  return (
    <>
      <GanttToolbar assignees={allAssignees} />
      <div className="mt-3 pb-8">
        <GanttChart bars={bars} projectId={projectId} />
      </div>
    </>
  );
}
