"use client";

import { useState } from "react";
import { ProjectFilter } from "@/components/ui/data-view/project-filter";
import { useListUrlState } from "@/components/ui/data-view/use-list-url-state";
import { Dialog } from "@/components/ui/dialog";
import { Toolbar } from "@/components/ui/toolbar";
import { formatDate } from "@/lib/format";
import { messages } from "@/lib/messages";
import type { CalendarEntry, MonthGrid } from "../calendar";
import { isClosedStatus } from "../schemas/todo-item";
import { TodoOccurrenceDialog } from "./todo-occurrence-dialog";

const C = messages.todoItems.calendar;
const WEEKDAYS = messages.todoItems.repeat.weekdays;
const SHOWN_PER_DAY = 3;

const navButton =
  "inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-line px-3 text-sm text-ink hover:bg-surface-raised";

/** Switches a to-do page between its list and the calendar; leaving restores the saved view. */
export function CalendarSwitch({ on }: { on: boolean }) {
  const { update } = useListUrlState();
  return (
    <button
      type="button"
      aria-pressed={on}
      data-testid="view-calendar"
      onClick={() =>
        update(
          on
            ? { view: null, month: null }
            : { view: "calendar", q: null, status: null, priority: null, projectOrActivity: null },
        )
      }
      className={`inline-flex min-h-11 items-center gap-2 rounded-md border border-line px-3 text-sm ${on ? "bg-accent-soft text-accent" : "text-ink-muted hover:bg-surface-raised"}`}
    >
      <svg
        viewBox="0 0 16 16"
        className="size-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden="true"
      >
        <rect x="1.5" y="2.5" width="13" height="12" rx="1.5" />
        <path d="M1.5 6.5h13M5 1v3M11 1v3" strokeLinecap="round" />
      </svg>
      {C.view}
    </button>
  );
}

function groupByDay(entries: readonly CalendarEntry[]): Map<string, CalendarEntry[]> {
  const byDay = new Map<string, CalendarEntry[]>();
  for (const entry of entries) {
    const list = byDay.get(entry.day);
    if (list) list.push(entry);
    else byDay.set(entry.day, [entry]);
  }
  return byDay;
}

function EntryButton({
  entry,
  onOpen,
}: {
  entry: CalendarEntry;
  onOpen: (entry: CalendarEntry) => void;
}) {
  const title = entry.todo.title ?? messages.app.untitled;
  const skipped = entry.occurrence?.isSkipped ?? false;
  const done = skipped || isClosedStatus(entry.status);
  return (
    <button
      type="button"
      title={title}
      data-testid="calendar-entry"
      data-key={entry.key}
      onClick={() => onOpen(entry)}
      className={`flex min-h-11 w-full items-center gap-1 rounded px-1 text-left text-xs hover:bg-surface-raised md:min-h-6 ${done ? "text-ink-muted line-through" : "text-ink"}`}
    >
      {entry.time ? <span className="shrink-0 tabular-nums">{entry.time}</span> : null}
      <span className="truncate">{title}</span>
      {skipped ? <span className="sr-only">{C.skipped}</span> : null}
    </button>
  );
}

function DayEntries({
  day,
  byDay,
  onOpen,
  onMore,
  limit = SHOWN_PER_DAY,
}: {
  day: string;
  byDay: Map<string, CalendarEntry[]>;
  onOpen: (entry: CalendarEntry) => void;
  onMore?: (day: string) => void;
  limit?: number;
}) {
  const all = byDay.get(day) ?? [];
  if (all.length === 0) return null;
  const shown = all.slice(0, limit);
  return (
    <ul className="mt-1 flex flex-col gap-0.5">
      {shown.map((entry) => (
        <li key={entry.key}>
          <EntryButton entry={entry} onOpen={onOpen} />
        </li>
      ))}
      {onMore && all.length > shown.length ? (
        <li>
          <button
            type="button"
            data-testid="calendar-more"
            onClick={() => onMore(day)}
            className="min-h-11 w-full rounded px-1 text-left text-xs font-medium text-accent hover:bg-surface-raised md:min-h-6"
          >
            {C.more(all.length - shown.length)}
          </button>
        </li>
      ) : null}
    </ul>
  );
}

/**
 * The to-do calendar: a Monday-first month grid, an agenda of the month's days at phone width.
 * A day shows three entries, then "+N more", which lists the whole day.
 */
export function TodoCalendar({
  month,
  grid,
  today,
  entries,
  cut,
  projectFilterOptions,
}: {
  /** "YYYY-MM". */
  month: string;
  grid: MonthGrid;
  /** "YYYY-MM-DD". */
  today: string;
  entries: readonly CalendarEntry[];
  /** How many series were cut short in this window. */
  cut: number;
  /** /todo's project filter; omitted on a project page. */
  projectFilterOptions?: readonly { id: number; name: string }[];
}) {
  const { update } = useListUrlState();
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [occurrence, setOccurrence] = useState<CalendarEntry | null>(null);
  const byDay = groupByDay(entries);
  const inMonth = (day: string) => day.startsWith(month);
  const openSeries = (entry: CalendarEntry) => {
    setOccurrence(null);
    update({ id: String(entry.todo.todoItemId) });
  };
  const open = (entry: CalendarEntry) => {
    setOpenDay(null);
    if (entry.occurrence) setOccurrence(entry);
    else openSeries(entry);
  };
  const weeks = Array.from({ length: 6 }, (_, w) => grid.days.slice(w * 7, w * 7 + 7));
  const agenda = grid.days.flatMap((day, i) =>
    inMonth(day) && byDay.has(day) ? [{ day, weekday: WEEKDAYS[i % 7] }] : [],
  );

  return (
    <div className="flex flex-col gap-3" data-testid="todo-calendar">
      <Toolbar>
        {projectFilterOptions ? <ProjectFilter options={projectFilterOptions} /> : null}
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label={C.previous}
            data-testid="calendar-previous"
            onClick={() => update({ month: grid.previous })}
            className={navButton}
          >
            <span aria-hidden="true">‹</span>
          </button>
          <span
            aria-live="polite"
            data-testid="calendar-month"
            className="min-w-20 text-center text-sm font-semibold tabular-nums text-ink"
          >
            {month}
          </span>
          <button
            type="button"
            aria-label={C.next}
            data-testid="calendar-next"
            onClick={() => update({ month: grid.next })}
            className={navButton}
          >
            <span aria-hidden="true">›</span>
          </button>
        </div>
        <button
          type="button"
          data-testid="calendar-today"
          onClick={() => update({ month: null })}
          className={navButton}
        >
          {C.today}
        </button>
        <div className="ml-auto">
          <CalendarSwitch on />
        </div>
      </Toolbar>

      {cut > 0 ? (
        <p role="status" className="text-sm text-warning">
          {C.cut}
        </p>
      ) : null}
      {agenda.length === 0 ? (
        <p className="text-sm text-ink-muted" data-testid="calendar-empty">
          {C.empty}
        </p>
      ) : null}

      <table className="hidden w-full table-fixed border-collapse md:table" aria-label={month}>
        <thead>
          <tr>
            {WEEKDAYS.map((weekday) => (
              <th key={weekday} scope="col" className="py-1 text-xs font-medium text-ink-muted">
                {weekday}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week[0]}>
              {week.map((day) => (
                <td
                  key={day}
                  data-testid="calendar-day"
                  data-day={day}
                  className={`h-28 border border-line p-1 align-top ${inMonth(day) ? "bg-surface" : "bg-surface-sunken"}`}
                >
                  <span
                    aria-current={day === today ? "date" : undefined}
                    className={`inline-flex size-6 items-center justify-center rounded-full text-xs tabular-nums ${day === today ? "bg-accent-soft font-semibold text-accent" : inMonth(day) ? "text-ink" : "text-ink-muted"}`}
                  >
                    <span aria-hidden="true">{Number(day.slice(8))}</span>
                    <span className="sr-only">{formatDate(day)}</span>
                  </span>
                  <DayEntries day={day} byDay={byDay} onOpen={open} onMore={setOpenDay} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <ol className="flex flex-col gap-3 md:hidden" data-testid="calendar-agenda">
        {agenda.map(({ day, weekday }) => (
          <li key={day} data-day={day} className="rounded-md border border-line p-2">
            <p
              aria-current={day === today ? "date" : undefined}
              className={`text-sm font-semibold ${day === today ? "text-accent" : "text-ink"}`}
            >
              {weekday} {formatDate(day)}
            </p>
            <DayEntries day={day} byDay={byDay} onOpen={open} onMore={setOpenDay} />
          </li>
        ))}
      </ol>

      <Dialog
        open={openDay !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setOpenDay(null);
        }}
        title={openDay ? C.dayTitle(formatDate(openDay)) : ""}
      >
        {openDay ? <DayEntries day={openDay} byDay={byDay} onOpen={open} limit={Infinity} /> : null}
      </Dialog>
      <TodoOccurrenceDialog
        entry={occurrence}
        onClose={() => setOccurrence(null)}
        onSeries={openSeries}
      />
    </div>
  );
}
