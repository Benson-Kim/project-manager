import Link from "next/link";
import { EmptyState } from "@/components/ui/states";
import { messages } from "@/lib/messages";
import { formatDate } from "../lib/format";
import type { GanttBar } from "../schemas/key-deliverable";
import { Badge, OverdueBadge } from "./badges";

const DAY_MS = 86_400_000;

/**
 * CSS-grid horizontal Gantt (issue #9, ADR-0010 full-route exception): Server
 * Component, no charting library. Each bar is a keyboard-focusable link into
 * the deliverable Sheet with the accessible name
 * "Requirement, start to deadline, status". Bar width transitions use CSS only
 * (≤ 250 ms, disabled under reduced motion). The timeline scrolls horizontally
 * at narrow widths with sticky requirement labels; `print:` styles make the
 * route the report/downloadable view.
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
  // Pad the window by one day each side so edge bars stay visible.
  const rangeStart = minMs - DAY_MS;
  const rangeEnd = maxMs + DAY_MS;
  const span = Math.max(rangeEnd - rangeStart, DAY_MS);

  const pos = (ms: number) => ((ms - rangeStart) / span) * 100;

  return (
    <div
      className="overflow-x-auto rounded-lg border border-line bg-surface print:overflow-visible print:border-0"
      data-testid="gantt-chart"
    >
      <div className="min-w-[640px] print:min-w-0">
        {/* Time axis */}
        <div
          className="grid grid-cols-[10rem_1fr] border-b border-line sm:grid-cols-[16rem_1fr]"
          aria-hidden="true"
        >
          <div className="sticky left-0 bg-surface px-3 py-2 text-xs font-medium text-ink-muted">
            {messages.keyDeliverables.ganttAxis}
          </div>
          <div className="relative px-0 py-2">
            <span className="absolute left-1 text-xs text-ink-muted">
              {formatDate(new Date(rangeStart))}
            </span>
            <span className="absolute right-1 text-xs text-ink-muted">
              {formatDate(new Date(rangeEnd))}
            </span>
            <span className="invisible text-xs">.</span>
          </div>
        </div>
        <ul className="m-0 list-none p-0">
          {bars.map((bar) => {
            const left = pos(bar.start.getTime());
            const width = Math.max(pos(bar.end.getTime()) - left, 1.5);
            const name = messages.keyDeliverables.ganttBarName(
              bar.requirement || messages.keyDeliverables.deliverableFallback(bar.id),
              formatDate(bar.start),
              formatDate(bar.end),
              bar.status ?? messages.projects.none,
            );
            return (
              <li
                key={bar.id}
                className="grid grid-cols-[10rem_1fr] items-center border-b border-line last:border-b-0 sm:grid-cols-[16rem_1fr]"
              >
                <div className="sticky left-0 flex flex-col gap-1 bg-surface px-3 py-2">
                  <span className="line-clamp-2 text-sm text-ink">
                    {bar.requirement || messages.keyDeliverables.deliverableFallback(bar.id)}
                  </span>
                  <span className="flex flex-wrap gap-1">
                    <Badge value={bar.status} />
                    {bar.overdue ? <OverdueBadge /> : null}
                  </span>
                </div>
                <div className="relative h-12">
                  <Link
                    href={`/projects/${projectId}/deliverables?d=${bar.id}`}
                    aria-label={name}
                    data-testid={`gantt-bar-${bar.id}`}
                    className={`absolute top-1/2 block h-5 min-w-2 -translate-y-1/2 rounded-sm transition-[width] duration-(--duration-base) outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus motion-reduce:transition-none ${
                      bar.overdue ? "bg-danger" : "bg-accent"
                    }`}
                    style={{ left: `${left}%`, width: `${width}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
