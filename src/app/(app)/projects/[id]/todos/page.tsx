import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { auth } from "@/lib/auth/provider";
import { flattenSearchParams, parseListParams } from "@/lib/list-params";
import { messages } from "@/lib/messages";
import { getViewPreference } from "@/lib/repositories/view-preference";
import { buildNewEntityHref, guardProjectScope } from "@/lib/project-page-helpers";
import { orNotFound, orNull } from "@/lib/row-access";
import { getProjectPermissions } from "@/modules/projects/repository/project-access";
import { TodoItemSheet } from "@/modules/todo-items/components/todo-item-sheet";
import { TodoView } from "@/modules/todo-items/components/todo-view";
import {
  getTodoItemById,
  listTodoItems,
  type TodoListFilters,
} from "@/modules/todo-items/repository/todo-items";
import { getTodoAlertByTodoItemId } from "@/modules/todo-items/repository/todo-alerts";
import { listDailyActivityOptions } from "@/modules/todo-items/repository/daily-activity-options";
import { parseProjectId } from "../project-id";

export const metadata: Metadata = {
  title: `${messages.todoItems.title} — ${messages.app.name}`,
};

/**
 * To-do list (project-scoped section under /projects/[id]/todos, ADR-0018);
 * DataView + search + status/priority filters; detail/edit in the URL-synced
 * Sheet (?id=<n> | ?id=new, ADR-0010). Default sort: DueDate asc.
 * The optional alert panel is fetched in parallel when a todo is selected.
 */
export default async function TodosPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth.requireSession();
  const { id } = await params;
  const projectId = parseProjectId(id);
  if (projectId === null) notFound();

  const raw = await searchParams;
  const flat = flattenSearchParams(raw);
  const listParams = parseListParams(raw);
  const effectiveParams = {
    ...listParams,
    sort: listParams.sort ?? "DueDate",
  };

  const isNew = flat.id === "new";
  const selectedId = !isNew && flat.id ? Number(flat.id) : null;

  const filters: TodoListFilters = {
    status: flat.status ?? null,
    priority: flat.priority ?? null,
    projectOrActivity: flat.projectOrActivity ?? null,
  };

  const [rows, preferredView, activityOptions, selectedRaw, allows] = await Promise.all([
    orNotFound(listTodoItems(effectiveParams, session.userId, projectId, undefined, filters)),
    getViewPreference(session.userId, "todo-items").catch(() => null),
    listDailyActivityOptions(projectId, session.userId).catch(() => []),
    selectedId && Number.isInteger(selectedId) && selectedId > 0
      ? orNull(getTodoItemById(selectedId, session.userId))
      : null,
    getProjectPermissions(projectId, session.userId),
  ]);

  // A deep link to a todo from another project is treated as not found.
  const selected = guardProjectScope(selectedRaw, projectId);

  // Fetch the alert only when a specific todo is selected.
  const selectedAlert = selected
    ? await getTodoAlertByTodoItemId(selected.TodoItemId, session.userId).catch(() => null)
    : null;

  const totalCount = rows[0]?.TotalCount ?? 0;
  const canCreate = allows("todo-items:create");
  const canEdit = allows("todo-items:update");
  const canDelete = allows("todo-items:delete");
  const canCreateAlert = allows("todo-alerts:create");
  const canUpdateAlert = allows("todo-alerts:update");
  const canDeleteAlert = allows("todo-alerts:delete");
  const canReorder = allows("todo-items:update");
  const filtersActive = Boolean(
    effectiveParams.q || flat.status || flat.priority || flat.projectOrActivity,
  );

  const newTodoLink = (
    <Link
      href={buildNewEntityHref(`/projects/${projectId}/todos`, flat)}
      data-testid="new-todo-item"
      className="inline-flex min-h-10 items-center rounded-md border border-line bg-surface px-4 text-sm font-medium text-ink hover:bg-surface-raised"
    >
      {messages.todoItems.newTodoItem}
    </Link>
  );

  return (
    <>
      <PageHeader title={messages.todoItems.title} action={canCreate ? newTodoLink : undefined} />
      <div className="mt-3 flex flex-col flex-1">
        <TodoView
          rows={rows}
          totalCount={totalCount}
          page={effectiveParams.page}
          initialView={effectiveParams.view ?? preferredView ?? "list"}
          filtersActive={filtersActive}
          canReorder={canReorder}
          newTodoAction={canCreate ? newTodoLink : undefined}
        />
      </div>
      <TodoItemSheet
        todoItem={selected}
        todoAlert={selectedAlert}
        isNew={isNew && canCreate}
        projectId={projectId}
        dailyActivityOptions={activityOptions}
        canEdit={canEdit}
        canDelete={canDelete}
        canCreateAlert={canCreateAlert}
        canUpdateAlert={canUpdateAlert}
        canDeleteAlert={canDeleteAlert}
      />
    </>
  );
}
