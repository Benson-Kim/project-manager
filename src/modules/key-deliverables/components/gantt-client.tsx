"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { formatDate } from "@/lib/format";
import { messages } from "@/lib/messages";
import { GanttChart } from "./gantt-chart";
import { GanttToolbar } from "./gantt-toolbar";
import type { GanttBar } from "../schemas/key-deliverable";

// ---------------------------------------------------------------------------
// Tooltip state / types
// ---------------------------------------------------------------------------

interface TooltipState {
  bar: GanttBar;
  x: number;
  y: number;
}

// ---------------------------------------------------------------------------
// Duration helper
// ---------------------------------------------------------------------------

function durationLabel(start: Date, end: Date, now: Date): string {
  const elapsed = Math.max(0, Math.min(now.getTime(), end.getTime()) - start.getTime());
  const total = Math.max(1, end.getTime() - start.getTime());
  const elapsedDays = Math.round(elapsed / 86_400_000);
  const totalDays = Math.round(total / 86_400_000);
  return messages.keyDeliverables.ganttDuration(elapsedDays, totalDays);
}

// ---------------------------------------------------------------------------
// Tooltip component
// ---------------------------------------------------------------------------

function GanttTooltip({ state }: { state: TooltipState }) {
  const { bar, x, y } = state;
  const now = new Date();

  // Keep tooltip inside the viewport horizontally
  const tipRef = useRef<HTMLDivElement>(null);
  const [adjustedX, setAdjustedX] = useState(x);

  useEffect(() => {
    if (!tipRef.current) return;
    const rect = tipRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    if (rect.right > vw - 8) {
      setAdjustedX(x - (rect.right - vw + 16));
    } else {
      setAdjustedX(x);
    }
  }, [x]);

  const rows: { label: string; value: string }[] = [
    { label: messages.keyDeliverables.status, value: bar.status ?? messages.projects.none },
    { label: messages.keyDeliverables.priority, value: bar.priority ?? messages.projects.none },
    { label: messages.keyDeliverables.requestedDate, value: formatDate(bar.start) ?? "" },
    { label: messages.keyDeliverables.deadline, value: formatDate(bar.end) ?? "" },
    { label: messages.keyDeliverables.ganttElapsed, value: durationLabel(bar.start, bar.end, now) },
  ];

  return (
    <div
      ref={tipRef}
      role="tooltip"
      className="pointer-events-none fixed z-50 max-w-xs rounded-md border border-line bg-surface px-3 py-2 shadow-md"
      style={{ left: adjustedX, top: y - 8, transform: "translateY(-100%)" }}
    >
      <dl className="space-y-0.5">
        {rows.map((r) => (
          <div key={r.label} className="flex gap-2 text-xs">
            <dt className="min-w-[80px] text-ink-muted">{r.label}</dt>
            <dd className="text-ink">{r.value}</dd>
          </div>
        ))}
      </dl>
      {bar.overdue ? (
        <p className="mt-1.5 text-xs font-medium text-danger">
          {messages.keyDeliverables.overdue}
        </p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Client filter + tooltip controller
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
 *  - Hover tooltip (absolute positioned, clipped to viewport)
 *
 * GanttChart stays a Server Component (no changes there) — it receives the
 * filtered bar list as a plain prop.
 */
export function GanttClient({ allBars, projectId, allAssigneeNames }: GanttClientProps) {
  const searchParams = useSearchParams();
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

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

  // ---- tooltip handlers ------------------------------------------------------
  const handleBarEnter = useCallback((barId: number, e: MouseEvent) => {
    const bar = allBars.find((b) => b.id === barId);
    if (!bar) return;
    setTooltip({ bar, x: e.clientX, y: e.clientY });
  }, [allBars]);

  const handleBarLeave = useCallback(() => setTooltip(null), []);
  const handleBarMove  = useCallback((barId: number, e: MouseEvent) => {
    setTooltip((prev) =>
      prev?.bar.id === barId ? { ...prev, x: e.clientX, y: e.clientY } : prev,
    );
  }, []);

  // Attach event listeners to bar links via data-testid delegation
  useEffect(() => {
    const container = document.querySelector("[data-testid='gantt-chart']");
    if (!container) return;

    function barId(el: EventTarget | null): number | null {
      const link = (el as Element | null)?.closest("[data-gantt-bar]");
      const id = (link as HTMLElement | null)?.dataset.ganttBar;
      return id != null ? Number(id) : null;
    }

    const onEnter = (e: Event) => {
      const id = barId(e.target);
      if (id != null) handleBarEnter(id, e as MouseEvent);
    };
    const onLeave = (e: Event) => {
      const id = barId(e.target);
      if (id != null) handleBarLeave();
    };
    const onMove = (e: Event) => {
      const id = barId(e.target);
      if (id != null) handleBarMove(id, e as MouseEvent);
    };

    container.addEventListener("mouseenter", onEnter, true);
    container.addEventListener("mouseleave", onLeave, true);
    container.addEventListener("mousemove",  onMove,  true);
    return () => {
      container.removeEventListener("mouseenter", onEnter, true);
      container.removeEventListener("mouseleave", onLeave, true);
      container.removeEventListener("mousemove",  onMove,  true);
    };
  }, [handleBarEnter, handleBarLeave, handleBarMove]);

  return (
    <>
      <GanttToolbar assigneeNames={allAssigneeNames} />
      <div className="mt-3 pb-8">
        <GanttChart bars={bars} projectId={projectId} />
      </div>
      {tooltip ? <GanttTooltip state={tooltip} /> : null}
    </>
  );
}
