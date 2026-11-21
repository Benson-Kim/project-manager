"use client";

import { useListUrlState } from "@/components/ui/data-view/use-list-url-state";
import { messages } from "@/lib/messages";

const P = messages.todoItems.planner;

export type CalendarMode = "month" | "planner";

/** `day`, "YYYY-MM-DD", is where the other view opens: its month, or the planner's first day. */
export function CalendarModeSwitch({ mode, day }: { mode: CalendarMode; day: string }) {
  const { update } = useListUrlState();
  const option = (value: CalendarMode, label: string) => (
    <button
      type="button"
      aria-pressed={mode === value}
      data-testid={`calendar-mode-${value}`}
      onClick={() => {
        if (mode === value) return;
        update(
          value === "planner"
            ? { view: "planner", month: null, days: day }
            : { view: "calendar", days: null, month: day.slice(0, 7) },
        );
      }}
      className={`inline-flex min-h-11 items-center px-3 text-sm first:rounded-l-md last:rounded-r-md ${
        mode === value ? "bg-accent-soft text-accent" : "text-ink-muted hover:bg-surface-raised"
      }`}
    >
      {label}
    </button>
  );
  return (
    <div role="group" className="inline-flex rounded-md border border-line">
      {option("month", P.month)}
      {option("planner", P.name)}
    </div>
  );
}
