import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { auth } from "@/lib/auth/provider";
import { parseListParams } from "@/lib/list-params";
import { messages } from "@/lib/messages";
import { getViewPreference } from "@/lib/repositories/view-preference";
import { formatDate } from "@/lib/format";
import { TodoView } from "@/modules/todo-items/components/todo-view";
import {
  getUpcomingAlertRows,
  listTodoItems,
} from "@/modules/todo-items/repository/todo-items";

export const metadata: Metadata = {
  title: `${messages.todoItems.title} — ${messages.app.name}`,
};

/**
 * Global to-do page (top-level nav, /todo): cross-project list + upcoming
 * alerts panel. Creation always happens inside a project context — no new-todo
 * action here. Upcoming alerts use usp_Todo_GetUpcomingAlerts which mirrors
 * the Access qryUpcomingAlerts business rule.
 */
export default async function GlobalTodoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth.requireSession();
  const raw = await searchParams;
  const listParams = parseListParams(raw);
  const effectiveParams = {
    ...listParams,
    sort: listParams.sort ?? "DueDate",
  };

  const [rows, preferredView, alerts] = await Promise.all([
    listTodoItems(effectiveParams, session.userId, null),
    getViewPreference(session.userId, "todo-items").catch(() => null),
    getUpcomingAlertRows(session.userId).catch(() => []),
  ]);

  const totalCount = rows[0]?.TotalCount ?? 0;
  const filtersActive = Boolean(effectiveParams.q);

  return (
    <>
      <PageHeader title={messages.todoItems.title} />

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
    </>
  );
}
