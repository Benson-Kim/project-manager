import Link from "next/link";
import { todoColumns } from "@/modules/todo-items/repository/columns";
import { PageHeader } from "@/components/ui/page-header";
import { auth } from "@/lib/auth/provider";
import { flattenSearchParams, parseListParams, initialViewOf } from "@/lib/list-params";
import { listForView } from "@/lib/list-print";
import { messages } from "@/lib/messages";
import { getUserPreference } from "@/lib/repositories/user-preference";
import { getListPreference } from "@/lib/repositories/view-preference";
import { buildNewEntityHref, guardProjectScope } from "@/lib/project-page-helpers";
import { orNotFound, orNull } from "@/lib/row-access";
import { getProjectPermissions } from "@/modules/projects/repository/project-access";
import { calendarDay } from "@/modules/todo-items/calendar";
import { TodoItemSheet } from "@/modules/todo-items/components/todo-item-sheet";
import { TodoCalendar } from "@/modules/todo-items/components/todo-calendar";
import { TodoPlanner } from "@/modules/todo-items/components/todo-planner";
import { TodoView } from "@/modules/todo-items/components/todo-view";
import { loadTodoCalendar } from "@/modules/todo-items/queries/load-todo-calendar";
import { loadTodoPlanner } from "@/modules/todo-items/queries/load-todo-planner";
import {
  getTodoItemById,
  listTodoItems,
  type TodoListFilters,
} from "@/modules/todo-items/repository/todo-items";
import { getTodoAlertByTodoItemId } from "@/modules/todo-items/repository/todo-alerts";
import { getTodoRecurrence } from "@/modules/todo-items/repository/todo-recurrence";
import { listDailyActivityOptions } from "@/modules/todo-items/repository/daily-activity-options";
import { LookupListsScope } from "@/modules/lookup-lists/components/lookup-lists-scope";
import { loadLookupLists } from "@/modules/lookup-lists/queries/load-lookup-lists";
import { TODO_ITEM_LISTS, TODO_ITEM_SORT } from "@/modules/todo-items/schemas/todo-item";

/**
 * A project's to-dos: the list or the calendar (?view=calendar) on the To-do section, the calendar
 * alone on the Calendar section. Detail/edit in the URL-synced Sheet (?id=<n> | ?id=new, ADR-0010);
 * a new to-do from a calendar day carries ?day=.
 */
export async function ProjectTodosScreen({
  projectId,
  raw,
  calendarOnly,
}: {
  projectId: number;
  raw: Record<string, string | string[] | undefined>;
  calendarOnly: boolean;
}) {
  const session = await auth.requireSession();
  const flat = flattenSearchParams(raw);
  const listParams = parseListParams(raw, TODO_ITEM_SORT);
  const effectiveParams = listParams;

  const isPlanner = flat.view === "planner";
  const isCalendar = calendarOnly || flat.view === "calendar" || isPlanner;
  const isNew = flat.id === "new";
  const selectedId = !isNew && flat.id ? Number(flat.id) : null;

  const filters: TodoListFilters = {
    status: flat.status ?? null,
    priority: flat.priority ?? null,
    projectOrActivity: flat.projectOrActivity ?? null,
  };

  const [
    rows,
    preference,
    activityOptions,
    selectedRaw,
    allows,
    lookup,
    userPreference,
    calendar,
    planner,
    labels,
    addedColumns,
  ] = await Promise.all([
    isCalendar
      ? []
      : orNotFound(
          listForView(effectiveParams, (p, size) =>
            listTodoItems(p, session.userId, projectId, size, filters),
          ),
        ),
    getListPreference(session.userId, "todo-items").catch(() => null),
    listDailyActivityOptions(projectId, session.userId).catch(() => []),
    selectedId && Number.isInteger(selectedId) && selectedId > 0
      ? orNull(getTodoItemById(selectedId, session.userId))
      : null,
    getProjectPermissions(projectId, session.userId),
    loadLookupLists(TODO_ITEM_LISTS, session),
    getUserPreference(session.userId).catch(() => null),
    isCalendar && !isPlanner
      ? orNotFound(loadTodoCalendar({ month: flat.month, projectId }, session.userId))
      : null,
    isPlanner
      ? orNotFound(
          loadTodoPlanner({ days: flat.days, projectId, search: flat.find }, session.userId),
        )
      : null,
    isCalendar ? [] : orNotFound(todoColumns.listLabels(projectId, session.userId)),
    isCalendar ? [] : orNotFound(todoColumns.listColumns(projectId, session.userId)),
  ]);

  // A deep link to a todo from another project is treated as not found.
  const selected = guardProjectScope(selectedRaw, projectId);

  // Fetch the alert and the repeat rule only when a specific todo is selected.
  const [selectedAlert, selectedRecurrence] = selected
    ? await Promise.all([
        getTodoAlertByTodoItemId(selected.TodoItemId, session.userId).catch(() => null),
        getTodoRecurrence(selected.TodoItemId, session.userId).catch(() => null),
      ])
    : [null, null];

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
      <PageHeader
        title={calendarOnly ? messages.projects.calendarSection : messages.todoItems.title}
        action={canCreate && !isCalendar ? newTodoLink : undefined}
      />
      <LookupListsScope {...lookup}>
        <div className="mt-3 flex flex-col flex-1">
          {planner ? (
            <TodoPlanner
              data={planner}
              projectId={projectId}
              canAdd={canCreate}
              canEdit={canEdit}
              canDelete={canDelete}
              switchable={!calendarOnly}
            />
          ) : calendar ? (
            <TodoCalendar {...calendar} canAdd={canCreate} switchable={!calendarOnly} />
          ) : (
            <TodoView
              projectId={projectId}
              labels={labels}
              addedColumns={addedColumns}
              canManageColumns={{ create: canCreate, update: canEdit, delete: canDelete }}
              canCreate={canCreate}
              rows={rows}
              totalCount={totalCount}
              page={effectiveParams.page}
              initialView={initialViewOf(effectiveParams.view, preference?.viewMode)}
              layout={preference?.layout}
              filtersActive={filtersActive}
              canReorder={canReorder}
              dueSoonDays={userPreference?.dueSoonDays}
              newTodoAction={canCreate ? newTodoLink : undefined}
            />
          )}
        </div>
        <TodoItemSheet
          todoItem={selected}
          todoAlert={selectedAlert}
          todoRecurrence={selectedRecurrence}
          isNew={isNew && canCreate}
          newDay={isNew ? calendarDay(flat.day) : null}
          alertDay={selected ? calendarDay(flat.alert) : null}
          projectId={projectId}
          dailyActivityOptions={activityOptions}
          canEdit={isNew ? canCreate : canEdit}
          canDelete={canDelete}
          canCreateAlert={canCreateAlert}
          canUpdateAlert={canUpdateAlert}
          canDeleteAlert={canDeleteAlert}
        />
      </LookupListsScope>
    </>
  );
}
