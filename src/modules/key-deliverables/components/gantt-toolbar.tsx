"use client";

import { Select } from "@/components/ui/form/inputs";
import { Toolbar } from "@/components/ui/toolbar";
import { useListUrlState } from "@/components/ui/data-view/use-list-url-state";
import { messages } from "@/lib/messages";
import { DELIVERABLE_PRIORITIES, DELIVERABLE_STATUSES } from "../schemas/key-deliverable";

interface GanttToolbarProps {
  /** Unique assignee names derived from bar data for the assignee filter. */
  assigneeNames: string[];
  children?: React.ReactNode;
}

/**
 * Gantt-specific toolbar: status, priority and assignee filters.
 * Filter changes update URL search params (replace, no push) so the server
 * re-renders with the filtered bar list on navigation.
 * The `assignee` filter is the plain display name of a comma-delimited
 * AssigneeNames string — matched with client-side includes().
 */
export function GanttToolbar({ assigneeNames, children }: GanttToolbarProps) {
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

      {/* Assignee filter (populated from actual bar data) */}
      {assigneeNames.length > 0 ? (
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
            {assigneeNames.map((name) => (
              <option key={name} value={name}>
                {name}
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
