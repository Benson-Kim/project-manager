"use client";

import { useSearchParams } from "next/navigation";
import { GanttChart } from "./gantt-chart";
import { GanttToolbar } from "./gantt-toolbar";
import type { GanttBar } from "../schemas/key-deliverable";

// ---------------------------------------------------------------------------
// Client filter controller
// ---------------------------------------------------------------------------

interface GanttClientProps {
  allBars: GanttBar[];
  projectId: number;
  /** Unique individual assignee names from all bars — for the filter select. */
  allAssigneeNames: string[];
}

/**
 * GanttClient: "use client" wrapper that owns:
 *  - URL-synced status / priority / assignee filters applied client-side
 *
 * GanttChart renders detail values (dates, status, priority) inline in each
 * bar row — no hover tooltip is used (no-tooltips UI rule; touch inaccessible).
 */
export function GanttClient({ allBars, projectId, allAssigneeNames }: GanttClientProps) {
  const searchParams = useSearchParams();

  // ---- filter ----------------------------------------------------------------
  const status = searchParams.get("status") ?? "";
  const priority = searchParams.get("priority") ?? "";
  const assignee = searchParams.get("assignee") ?? "";

  const bars = allBars.filter((b) => {
    if (status && b.status !== status) return false;
    if (priority && b.priority !== priority) return false;
    if (assignee) {
      // AssigneeNames is a comma-separated string from the proc
      const names = (b.assigneeNames ?? "").split(",").map((n) => n.trim());
      if (!names.includes(assignee)) return false;
    }
    return true;
  });

  return (
    <>
      <GanttToolbar assigneeNames={allAssigneeNames} />
      <div className="mt-3 pb-8">
        <GanttChart bars={bars} projectId={projectId} />
      </div>
    </>
  );
}
