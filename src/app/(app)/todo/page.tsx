import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/lib/auth/provider";
import { can } from "@/lib/auth/rbac";
import { AppError } from "@/lib/errors";
import { flattenSearchParams, parseListParams } from "@/lib/list-params";
import { messages } from "@/lib/messages";
import { getViewPreference } from "@/lib/repositories/view-preference";
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

export const metadata: Metadata = {
  title: `${messages.todoItems.title} — ${messages.app.name}`,
};

/**
 * Global to-do page (top-level nav, /todo): cross-project list + upcoming
 * alerts panel + URL-synced Sheet for detail/edit. Sheet is read-only when
 * the user lacks edit permissions. Creation links back to a project context.
 * Filter params (@Status, @Priority) forwarded server-side per module gap closure (#20).
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

  const selectedId = flat.id && flat.id !== "new" ? Number(flat.id) : null;

  const filters: TodoListFilters = {
    status: flat.status ?? null,
    priority: flat.priority ?? null,
    projectOrActivity: flat.projectOrActivity ?? null,
  };

  const [rows, preferredView, alerts, selectedRaw] = await Promise.all([
    listTodoItems(effectiveParams, session.userId, null, undefined, filters),
    getViewPreference(session.userId, "todo-items").catch(() => null),
    getUpcomingAlertRows(session.userId).catch(() => []),
    selectedId && Number.isInteger(selectedId) && selectedId > 0
      ? getTodoItemById(selectedId, session.userId).catch((err) => {
          if (err instanceof AppError && err.code === "NOT_FOUND") return null;
          throw err;
        })
      : Promise.resolve(null),
  ]);

  const selected = selectedRaw ?? null;

  // Fetch the alert only when a specific todo is selected.
  const selectedAlert = selected
    ? await getTodoAlertByTodoItemId(selected.TodoItemId, session.userId).catch(() => null)
    : null;

  const totalCount = rows[0]?.TotalCount ?? 0;
  const canEdit = can(session.role, "todo-items:update");
  const canDelete = can(session.role, "todo-items:delete");
  const filtersActive = Boolean(effectiveParams.q || flat.status || flat.priority || flat.projectOrActivity);

  return (
    <>

      {/* Upcoming alerts panel */}
      {alerts.length > 0 ? (
        <section
          aria-labelledby="upcoming-alerts-heading"
          className="mb-6 rounded-md border border-line bg-surface p-4"
        >
          <h2
            id="upcoming-alerts-heading"
            className="mb-3 text-sm font-semibold text-ink"
          >
            {messages.todoItems.upcomingAlerts}
          </h2>
          <ul className="flex flex-col gap-2">
            {alerts.map((alert) => (
              <li key={alert.TodoItemId} className="flex items-center justify-between gap-4">
                <span className="text-sm text-ink">
                  {alert.TodoItem ?? messages.app.untitled}
                </span>
                <div className="flex items-center gap-3 text-xs text-ink-muted">
                  <span
                    className={
                      alert.AlertType === "Overdue"
                        ? "font-semibold text-red-600"
                        : "font-semibold text-amber-600"
                    }
                  >
                    {alert.AlertType === "Overdue"
                      ? messages.todoItems.overdue
                      : messages.todoItems.approachingDeadline}
                  </span>
                  <span>{formatDate(alert.DueDate)}</span>
                  <Link
                    href={`/todo?id=${alert.TodoItemId}`}
                    className="text-accent underline"
                  >
                    {messages.actions.edit}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="flex flex-col flex-1">
        <TodoView
          rows={rows}
          totalCount={totalCount}
          page={effectiveParams.page}
          initialView={effectiveParams.view ?? preferredView ?? "list"}
          filtersActive={filtersActive}
          emptyBody={messages.todoItems.emptyGlobalBody}
        />
      </div>

      {/* Sheet: no create (project-scoped); edit/alert management when canEdit */}
      <TodoItemSheet
        todoItem={selected}
        todoAlert={selectedAlert}
        isNew={false}
        projectId={selected?.ProjectId ?? 0}
        dailyActivityOptions={[]}
        canEdit={canEdit}
        canDelete={canDelete}
      />
    </>
  );
}
