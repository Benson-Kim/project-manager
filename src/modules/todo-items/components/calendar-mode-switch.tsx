"use client";

import { useListUrlState } from "@/components/ui/data-view/use-list-url-state";
import { messages } from "@/lib/messages";

const P = messages.todoItems.planner;

export type CalendarMode = "month" | "planner";

export function CalendarModeSwitch({ mode }: { mode: CalendarMode }) {
  const { update } = useListUrlState();
  const option = (value: CalendarMode, label: string) => (
    <button
      type="button"
      aria-pressed={mode === value}
      data-testid={`calendar-mode-${value}`}
      onClick={() =>
        update(
          value === "planner" ? { view: "planner", month: null } : { view: "calendar", days: null },
        )
      }
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
