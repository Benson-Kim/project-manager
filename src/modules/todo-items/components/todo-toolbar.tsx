"use client";

import { ListFilter } from "@/components/ui/data-view/list-filter";
import { ProjectFilter } from "@/components/ui/data-view/project-filter";
import { SearchInput } from "@/components/ui/data-view/search-input";
import { useListUrlState } from "@/components/ui/data-view/use-list-url-state";
import { Select } from "@/components/ui/form/inputs";
import { Toolbar } from "@/components/ui/toolbar";
import { messages } from "@/lib/messages";
import { PROJECT_OR_ACTIVITY } from "../schemas/todo-item";

/**
 * To-do toolbar: search + project filter (/todo only) + status filter +
 * priority filter + type filter + view toggle. On a project page the route
 * scopes it.
 */
export function TodoToolbar({
  projectFilterOptions,
  children,
}: {
  /** The projects of /todo's project filter; omitted on a project page. */
  projectFilterOptions?: readonly { id: number; name: string }[];
  children?: React.ReactNode;
}) {
  const { searchParams, update } = useListUrlState();

  return (
    <Toolbar>
      <SearchInput testId="todo-search" placeholder={messages.list.search} />
      {projectFilterOptions ? <ProjectFilter options={projectFilterOptions} /> : null}

      {/* Status filter */}
      <ListFilter
        list="todo-item.status"
        param="status"
        label={messages.todoItems.status}
        allLabel={messages.todoItems.allStatuses}
        testId="filter-status"
      />

      {/* Priority filter */}
      <ListFilter
        list="todo-item.priority"
        param="priority"
        label={messages.todoItems.priority}
        allLabel={messages.todoItems.allPriorities}
        testId="filter-priority"
      />

      {/* Type filter (Project / Daily Activity / None) */}
      <label>
        <span className="sr-only">{messages.todoItems.projectOrActivity}</span>
        <Select
          name="projectOrActivity"
          data-testid="filter-type"
          value={searchParams.get("projectOrActivity") ?? ""}
          onChange={(e) => update({ projectOrActivity: e.target.value || null, page: null })}
          className="w-auto"
        >
          <option value="">{messages.todoItems.allTypes}</option>
          {PROJECT_OR_ACTIVITY.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
      </label>

      {/* View toggle — injected by DataView via renderToolbar */}
      {children}
    </Toolbar>
  );
}
