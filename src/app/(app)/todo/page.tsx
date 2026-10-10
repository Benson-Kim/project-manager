import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/lib/auth/provider";
import { flattenSearchParams, parseListParams, initialViewOf } from "@/lib/list-params";
import { messages } from "@/lib/messages";
import { getListPreference } from "@/lib/repositories/view-preference";
import { orNull } from "@/lib/row-access";
import { formatDate } from "@/lib/format";
import { TodoView } from "@/modules/todo-items/components/todo-view";
import { TodoItemSheet } from "@/modules/todo-items/components/todo-item-sheet";
import {
  getUpcomingAlertRows,
  listTodoItems,
  getTodoItemById,
  type TodoListFilters,
} from "@/modules/todo-items/repository/todo-items";
import { getTodoAlertByTodoItemId } from "@/modules/todo-items/repository/todo-alerts";
import { getTodoPermissions } from "@/modules/todo-items/repository/todo-access";
import { TODO_ITEM_LISTS } from "@/modules/todo-items/schemas/todo-item";
import {
  canAddWith,
  filteredProjectId,
  parseProjectFilter,
  projectPicker,
} from "@/modules/projects/project-options";
import { listProjectOptions } from "@/modules/projects/repository/projects";
import { LookupListsScope } from "@/modules/lookup-lists/components/lookup-lists-scope";
import { loadLookupLists } from "@/modules/lookup-lists/queries/load-lookup-lists";

export const metadata: Metadata = {
  title: `${messages.todoItems.title} — ${messages.app.name}`,
};

/**
 * Global to-do page (top-level nav, /todo): cross-project list + upcoming
 * alerts panel + URL-synced Sheet for detail/edit/create. Todo items may be
 * project-unscoped (ProjectId nullable), so creation is allowed here via
 * ?id=new when the user has todo-items:create permission.
 * Filter params (@Status, @Priority) forwarded server-side per module gap closure (#20);
 * `?project=<id>|none` narrows to one project or to personal to-dos, and the
 * datasheet's Project column moves to-dos between them.
 */
export default async function GlobalTodoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth.requireSession();
  const raw = await searchParams;
  const flat = flattenSearchParams(raw);
  const listParams = parseListParams(raw);
  const effectiveParams = {
    ...listParams,
    sort: listParams.sort ?? "DueDate",
  };

  const isNew = flat.id === "new";
  const selectedId = flat.id && !isNew ? Number(flat.id) : null;

  // Shared with the layout's project switcher (cached per request).
  const projectOptions = await listProjectOptions(session.userId);
  const projectFilter = parseProjectFilter(flat.project, projectOptions);
  const filters: TodoListFilters = {
    status: flat.status ?? null,
    priority: flat.priority ?? null,
    projectOrActivity: flat.projectOrActivity ?? null,
    withoutProject: projectFilter.kind === "none",
  };

  const [rows, preference, alerts, selected, lookup, personal] = await Promise.all([
    listTodoItems(
      effectiveParams,
      session.userId,
      filteredProjectId(projectFilter),
      undefined,
      filters,
    ),
    getListPreference(session.userId, "todo-items").catch(() => null),
    getUpcomingAlertRows(session.userId).catch(() => []),
    selectedId && Number.isInteger(selectedId) && selectedId > 0
      ? orNull(getTodoItemById(selectedId, session.userId))
      : null,
    loadLookupLists(TODO_ITEM_LISTS, session),
    // The new-entry row adds personal, project-less to-dos.
    getTodoPermissions(null, session.userId),
  ]);

  // Fetch the alert only when a specific todo is selected.
  const [selectedAlert, allows] = await Promise.all([
    selected
      ? getTodoAlertByTodoItemId(selected.TodoItemId, session.userId).catch(() => null)
      : null,
    getTodoPermissions(selected, session.userId),
  ]);

  const totalCount = rows[0]?.TotalCount ?? 0;
  const canCreate = allows("todo-items:create");
  const canEdit = allows("todo-items:update");
  const canDelete = allows("todo-items:delete");
  const canCreateAlert = allows("todo-alerts:create");
  const canUpdateAlert = allows("todo-alerts:update");
  const canDeleteAlert = allows("todo-alerts:delete");
  const filtersActive = Boolean(
    effectiveParams.q ||
    flat.status ||
    flat.priority ||
    flat.projectOrActivity ||
    projectFilter.kind !== "all",
  );
  const projects = projectPicker(
    projectOptions,
    "todo-items:create",
    personal("todo-items:create"),
    filteredProjectId(projectFilter),
  );

  return (
    <>
      {/* The top bar shows the title; the page still needs its heading for assistive tech. */}
      <h1 className="sr-only">{messages.todoItems.title}</h1>
      {/* Upcoming alerts panel */}
      {alerts.length > 0 ? (
        <section
          aria-labelledby="upcoming-alerts-heading"
          className="mb-6 rounded-md border border-line bg-surface p-4"
        >
          <h2 id="upcoming-alerts-heading" className="mb-3 text-sm font-semibold text-ink">
            {messages.todoItems.upcomingAlerts}
          </h2>
          <ul className="flex flex-col gap-2">
            {alerts.map((alert) => (
              <li key={alert.TodoItemId} className="flex items-center justify-between gap-4">
                <span className="text-sm text-ink">{alert.TodoItem ?? messages.app.untitled}</span>
                <div className="flex items-center gap-3 text-xs text-ink-muted">
                  <span
                    className={
                      alert.AlertType === "Overdue"
                        ? "font-semibold text-danger"
                        : "font-semibold text-warning"
                    }
                  >
                    {alert.AlertType === "Overdue"
                      ? messages.todoItems.overdue
                      : messages.todoItems.approachingDeadline}
                  </span>
                  <span>{formatDate(alert.DueDate)}</span>
                  <Link href={`/todo?id=${alert.TodoItemId}`} className="text-accent underline">
                    {messages.actions.edit}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <LookupListsScope {...lookup}>
        <div className="flex flex-col flex-1">
          <TodoView
            rows={rows}
            totalCount={totalCount}
            page={effectiveParams.page}
            initialView={initialViewOf(effectiveParams.view, preference?.viewMode)}
            layout={preference?.layout}
            filtersActive={filtersActive}
            projectId={null}
            projects={projects}
            projectFilterOptions={projectOptions}
            canCreate={canAddWith(projects)}
            emptyBody={messages.todoItems.emptyGlobalBody}
          />
        </div>

        {/* Sheet: create (project-unscoped, projectId=null) or edit when canEdit */}
        <TodoItemSheet
          todoItem={selected}
          todoAlert={selectedAlert}
          isNew={isNew && canCreate}
          projectId={selected?.ProjectId ?? null}
          dailyActivityOptions={[]}
          canEdit={canEdit}
          canDelete={canDelete}
          canCreateAlert={canCreateAlert}
          canUpdateAlert={canUpdateAlert}
          canDeleteAlert={canDeleteAlert}
        />
      </LookupListsScope>
    </>
  );
}
