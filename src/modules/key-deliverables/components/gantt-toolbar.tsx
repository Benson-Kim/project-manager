"use client";

import { Select } from "@/components/ui/form/inputs";
import { Toolbar } from "@/components/ui/toolbar";
import { useListUrlState } from "@/components/ui/data-view/use-list-url-state";
import { messages } from "@/lib/messages";
import { DELIVERABLE_PRIORITIES, DELIVERABLE_STATUSES, type AssigneeEntry } from "../schemas/key-deliverable";

interface GanttToolbarProps {
  /** Unique assignees (by id) derived from bar data for the assignee filter. */
  assignees: AssigneeEntry[];
  children?: React.ReactNode;
}

/**
 * Gantt-specific toolbar: status, priority and assignee filters.
 * Filter changes update URL search params (replace, no push) so the server
 * re-renders with the filtered bar list on navigation.
 * The `assignee` param carries the numeric stakeholder id for exact identity
 * matching — immune to commas or other punctuation in display names.
 */
export function GanttToolbar({ assignees, children }: GanttToolbarProps) {
  const { searchParams, update } = useListUrlState();

  return (
    <div data-gantt-toolbar="">
    <Toolbar>
      {/* Status filter */}
      <label>
        <span className="sr-only">{messages.keyDeliverables.status}</span>
        <Select
          name="status"
          data-testid="gantt-filter-status"
          value={searchParams.get("status") ?? ""}
          onChange={(e) => update({ status: e.target.value || null })}
          className="w-auto"
        >
          <option value="">{messages.keyDeliverables.allStatuses}</option>
          {DELIVERABLE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      </label>

      {/* Priority filter */}
      <label>
        <span className="sr-only">{messages.keyDeliverables.priority}</span>
        <Select
          name="priority"
          data-testid="gantt-filter-priority"
          value={searchParams.get("priority") ?? ""}
          onChange={(e) => update({ priority: e.target.value || null })}
          className="w-auto"
        >
          <option value="">{messages.keyDeliverables.allPriorities}</option>
          {DELIVERABLE_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </Select>
      </label>

      {/* Assignee filter (populated from actual bar data; value = stakeholder id) */}
      {assignees.length > 0 ? (
        <label>
          <span className="sr-only">{messages.keyDeliverables.assignees}</span>
          <Select
            name="assignee"
            data-testid="gantt-filter-assignee"
            value={searchParams.get("assignee") ?? ""}
            onChange={(e) => update({ assignee: e.target.value || null })}
            className="w-auto"
          >
            <option value="">{messages.keyDeliverables.allAssignees}</option>
            {assignees.map((a) => (
              <option key={a.id} value={String(a.id)}>
                {a.name}
              </option>
            ))}
          </Select>
        </label>
      ) : null}

      {children}
    </Toolbar>
    </div>
  );
}
