"use client";

import { Select } from "@/components/ui/form/inputs";
import { Toolbar } from "@/components/ui/toolbar";
import { useListUrlState } from "@/components/ui/data-view/use-list-url-state";
import { messages } from "@/lib/messages";
import { ListFilter } from "@/components/ui/data-view/list-filter";
import type { AssigneeEntry } from "../schemas/key-deliverable";

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

  // Render the assignee select whenever there are options OR when a (now-stale)
  // assignee parameter is active.  Without this, a bookmarked ?assignee=<id>
  // whose last assignee was removed shows an empty chart with no way to clear
  // the filter.
  const activeAssignee = searchParams.get("assignee") ?? "";
  const showAssigneeFilter = assignees.length > 0 || activeAssignee !== "";

  return (
    <div data-gantt-toolbar="">
      <Toolbar>
        <ListFilter
          list="key-deliverable.status"
          param="status"
          label={messages.keyDeliverables.status}
          allLabel={messages.keyDeliverables.allStatuses}
          testId="gantt-filter-status"
        />
        <ListFilter
          list="key-deliverable.priority"
          param="priority"
          label={messages.keyDeliverables.priority}
          allLabel={messages.keyDeliverables.allPriorities}
          testId="gantt-filter-priority"
        />

        {/* Assignee filter (populated from actual bar data; value = stakeholder id).
          Always rendered when a stale ?assignee param is active so the user can
          clear it even after the last assignee is removed. */}
        {showAssigneeFilter ? (
          <label>
            <span className="sr-only">{messages.keyDeliverables.assignees}</span>
            <Select
              name="assignee"
              data-testid="gantt-filter-assignee"
              value={activeAssignee}
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
