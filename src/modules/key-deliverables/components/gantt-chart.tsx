import Link from "next/link";
import { EmptyState } from "@/components/ui/states";
import { messages } from "@/lib/messages";
import { formatDate } from "@/lib/format";
import type { GanttBar } from "../schemas/key-deliverable";

const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------
// Colour helpers
// ---------------------------------------------------------------------------

/** Bar background colour by priority ΓÇö semantic tokens only. */
function barBgClass(priority: string | null, overdue: boolean): string {
  if (overdue) return "bg-danger";
  switch (priority) {
    case "Critical":  return "bg-danger";
    case "Important": return "bg-accent-strong";
    case "Low":       return "bg-success";
    default:          return "bg-accent"; // Normal + null
  }
}

/** Completion-fill overlay ΓÇö slightly lighter inner stripe. */
function fillBgClass(priority: string | null, overdue: boolean): string {
  if (overdue) return "bg-on-accent opacity-30";
  switch (priority) {
    case "Critical":  return "bg-on-danger opacity-30";
    case "Important": return "bg-on-accent opacity-30";
    case "Low":       return "bg-on-accent opacity-30";
    default:          return "bg-on-accent opacity-30";
  }
}

// ---------------------------------------------------------------------------
// Timeline helpers
// ---------------------------------------------------------------------------

/** All Monday dates (week starts) within [start, end]. */
function weekStarts(start: Date, end: Date): Date[] {
  const weeks: Date[] = [];
  // Advance to first Monday at or after start
  const d = new Date(start);
  const dow = d.getUTCDay(); // 0=Sun
  const toMonday = dow === 0 ? 1 : dow === 1 ? 0 : 8 - dow;
  d.setUTCDate(d.getUTCDate() + toMonday);
  while (d.getTime() <= end.getTime()) {
    weeks.push(new Date(d));
    d.setUTCDate(d.getUTCDate() + 7);
  }
  return weeks;
}

/** Every calendar day in [start, end]. */
function allDays(start: Date, end: Date): Date[] {
  const days: Date[] = [];
  const d = new Date(start);
  while (d.getTime() <= end.getTime()) {
    days.push(new Date(d));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return days;
}

const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

/**
 * CSS-grid horizontal Gantt (module #9): Server Component, no charting
 * library. Features:
 * - Weekly column headers + day-of-week tick row
 * - Today vertical marker
 * - Bars coloured by priority; inner fill shows completion %
 * - Inline label (requirement + assignee) right of each bar
 * - Sticky label column + sticky timeline header
 * - Keyboard-accessible Link bars; print styles
 */
export function GanttChart({ bars, projectId }: { bars: GanttBar[]; projectId: number }) {
  if (bars.length === 0) {
    return (
      <EmptyState
        title={messages.list.emptyTitle}
        body={messages.keyDeliverables.ganttEmptyBody}
      />
    );
  }

  const minMs = Math.min(...bars.map((b) => b.start.getTime()));
  const maxMs = Math.max(...bars.map((b) => b.end.getTime()));
  // Pad 2 days each side so edge bars and labels are never clipped.
  const rangeStart = new Date(minMs - 2 * DAY_MS);
  const rangeEnd   = new Date(maxMs + 2 * DAY_MS);
  const span = Math.max(rangeEnd.getTime() - rangeStart.getTime(), DAY_MS);

  const pct = (ms: number) =>
    ((ms - rangeStart.getTime()) / span) * 100;

  const today       = new Date();
  const todayLeft   = pct(today.getTime());
  const showToday   = todayLeft >= 0 && todayLeft <= 100;

  const weeks = weekStarts(rangeStart, rangeEnd);
  const days  = allDays(rangeStart, rangeEnd);

  // Minimum chart width: 1 px per day so bars are always readable.
  const minWidthPx = Math.max(days.length * 28, 640);

  return (
    <div
      className="overflow-x-auto rounded-lg border border-line bg-surface print:overflow-visible print:border-0"
      data-testid="gantt-chart"
    >
      <div style={{ minWidth: `${minWidthPx}px` }}>

        {/* ΓöÇΓöÇ Timeline header (sticky top) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */}
        <div
          className="sticky top-0 z-(--z-nav) grid grid-cols-[10rem_1fr] border-b border-line bg-surface sm:grid-cols-[16rem_1fr]"
          aria-hidden="true"
        >
          {/* Label column header */}
          <div className="sticky left-0 border-r border-line bg-surface px-3 py-2 text-xs font-medium text-ink-muted">
            {messages.keyDeliverables.ganttAxis}
          </div>

          {/* Timeline column */}
          <div className="relative">
            {/* Week labels row */}
            <div className="relative h-7 border-b border-line">
              {weeks.map((w) => {
                const left = pct(w.getTime());
                if (left < 0 || left > 100) return null;
                return (
                  <span
                    key={w.getTime()}
                    className="absolute top-1 text-xs font-medium text-ink"
                    style={{ left: `${left}%` }}
                  >
                    {w.toLocaleDateString("en-CA", {
                      day: "numeric",
                      month: "short",
                      year: "2-digit",
                      timeZone: "UTC",
                    })}
                  </span>
                );
              })}
              {/* Today label */}
              {showToday ? (
                <span
                  className="absolute top-1 text-xs font-semibold text-danger"
                  style={{ left: `${todayLeft}%`, transform: "translateX(-50%)" }}
                >
                  Today
                </span>
              ) : null}
            </div>

            {/* Day-of-week ticks row */}
            <div className="relative h-6">
              {days.map((d) => {
                const left = pct(d.getTime());
                const letter = DAY_LETTERS[d.getUTCDay()];
                const isWeekend = d.getUTCDay() === 0 || d.getUTCDay() === 6;
                return (
                  <span
                    key={d.getTime()}
                    className={`absolute top-1 text-[10px] leading-none ${
                      isWeekend ? "text-ink-faint" : "text-ink-muted"
                    }`}
                    style={{ left: `${left}%`, transform: "translateX(-50%)" }}
                  >
                    {letter}
                  </span>
                );
              })}
            </div>
          </div>
        </div>

        {/* ΓöÇΓöÇ Bar rows ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */}
        <ul className="m-0 list-none p-0">
          {bars.map((bar, i) => {
            const barLeft  = pct(bar.start.getTime());
            const barRight = pct(bar.end.getTime());
            const barWidth = Math.max(barRight - barLeft, 0.5);
            const labelLeft = barLeft + barWidth;

            const ariaLabel = messages.keyDeliverables.ganttBarName(
              bar.requirement || messages.keyDeliverables.deliverableFallback(bar.id),
              formatDate(bar.start) ?? "",
              formatDate(bar.end) ?? "",
              bar.status ?? messages.projects.none,
            );

            return (
              <li
                key={bar.id}
                className={`grid grid-cols-[10rem_1fr] items-stretch border-b border-line last:border-b-0 sm:grid-cols-[16rem_1fr] ${
                  i % 2 === 0 ? "bg-surface" : "bg-surface-raised"
                }`}
              >
                {/* Sticky label column */}
                <div
                  className={`sticky left-0 flex flex-col justify-center border-r border-line px-3 py-2 ${
                    i % 2 === 0 ? "bg-surface" : "bg-surface-raised"
                  }`}
                >
                  <span className="line-clamp-2 text-sm font-medium text-ink">
                    {bar.requirement || messages.keyDeliverables.deliverableFallback(bar.id)}
                  </span>
                  {bar.assigneeNames ? (
                    <span className="mt-0.5 truncate text-xs text-ink-muted">
                      {bar.assigneeNames}
                    </span>
                  ) : null}
                </div>

                {/* Bar track */}
                <div className="relative h-12">
                  {/* Weekend column shading */}
                  {days.map((d) => {
                    const isWeekend = d.getUTCDay() === 0 || d.getUTCDay() === 6;
                    if (!isWeekend) return null;
                    const dl = pct(d.getTime());
                    const dw = pct(d.getTime() + DAY_MS) - dl;
                    return (
                      <div
                        key={d.getTime()}
                        aria-hidden="true"
                        className="absolute inset-y-0 bg-surface-sunken opacity-60"
                        style={{ left: `${dl}%`, width: `${dw}%` }}
                      />
                    );
                  })}

                  {/* Today line */}
                  {showToday ? (
                    <div
                      aria-hidden="true"
                      className="absolute inset-y-0 w-px bg-danger"
                      style={{ left: `${todayLeft}%` }}
                    />
                  ) : null}

                  {/* Bar */}
                  <Link
                    href={`/projects/${projectId}/deliverables?d=${bar.id}`}
                    aria-label={ariaLabel}
                    data-testid={`gantt-bar-${bar.id}`}
                    className="absolute top-1/2 flex min-h-[44px] min-w-[44px] -translate-y-1/2 items-center outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus"
                    style={{ left: `${barLeft}%`, width: `${barWidth}%` }}
                  >
                    <span
                      className={`relative block h-5 w-full overflow-hidden rounded-sm [print-color-adjust:exact] [-webkit-print-color-adjust:exact] ${barBgClass(bar.priority, bar.overdue)}`}
                    >
                      {/* Completion fill overlay */}
                      {bar.completionPct > 0 ? (
                        <span
                          aria-hidden="true"
                          className={`absolute inset-y-0 left-0 ${fillBgClass(bar.priority, bar.overdue)}`}
                          style={{ width: `${bar.completionPct}%` }}
                        />
                      ) : null}
                    </span>
                  </Link>

                  {/* Inline label right of bar */}
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute top-1/2 -translate-y-1/2 whitespace-nowrap text-xs text-ink-muted"
                    style={{ left: `calc(${labelLeft}% + 4px)` }}
                  >
                    {bar.requirement}
                    {bar.assigneeNames ? ` — ${bar.assigneeNames}` : ""}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
