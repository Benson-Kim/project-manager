import { execProc } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { DEFAULT_PAGE_SIZE, toProcListParams, type ListParams } from "@/lib/list-params";
import {
  createTodoItemInput,
  dueAlertRowSchema,
  reorderTodoItemInput,
  todoItemListRowSchema,
  todoItemRowSchema,
  updateTodoItemInput,
  upcomingAlertRowSchema,
  type CreateTodoItemInput,
  type CreateTodoItemParsed,
  type DueAlertRow,
  type ReorderTodoItemInput,
  type TodoItemListRow,
  type TodoItemRow,
  type UpdateTodoItemInput,
  type UpcomingAlertRow,
} from "../schemas/todo-item";

/**
 * TodoItem repository — stored procedures only, zod row parsing
 * (STANDARDS §2.5), list params forwarded 1:1.
 */

function toProcParams(input: CreateTodoItemParsed) {
  return {
    DailyActivityId: input.dailyActivityId ?? null,
    ProjectOrActivity: input.projectOrActivity ?? null,
    TodoItem: input.todoItem ?? null,
    StartDate: input.startDate ?? null,
    DueDate: input.dueDate ?? null,
    Priority: input.priority ?? null,
    Status: input.status ?? null,
    Notes: input.notes ?? null,
  };
}

export async function createTodoItem(
  input: CreateTodoItemInput,
  actorUserId: number,
): Promise<TodoItemRow> {
  const parsed = createTodoItemInput.parse(input);
  const rows = await execProc<TodoItemRow>("usp_TodoItem_Create", {
    ProjectId: parsed.projectId ?? null,
    ...toProcParams(parsed),
    ActorUserId: actorUserId,
  });
  return todoItemRowSchema.parse(rows[0]);
}

export async function getTodoItemById(
  todoItemId: number,
  actorUserId: number,
  actorRole: string,
): Promise<TodoItemRow> {
  const rows = await execProc<TodoItemRow>("usp_TodoItem_GetById", {
    TodoItemId: todoItemId,
    ActorUserId: actorUserId,
    ActorRole: actorRole,
  });
  if (!rows[0]) throw new AppError("NOT_FOUND", "TodoItem not found");
  return todoItemRowSchema.parse(rows[0]);
}

/** Module-specific filter params forwarded to usp_TodoItem_List. */
export interface TodoListFilters {
  status?: string | null;
  priority?: string | null;
  projectOrActivity?: string | null;
}

export async function listTodoItems(
  params: ListParams,
  actorUserId: number,
  projectId: number | null = null,
  pageSize: number = DEFAULT_PAGE_SIZE,
  filters: TodoListFilters = {},
  actorRole?: string,
): Promise<TodoItemListRow[]> {
  const rows = await execProc<TodoItemListRow>("usp_TodoItem_List", {
    ActorUserId: actorUserId,
    ActorRole: actorRole ?? null,
    ProjectId: projectId,
    ...toProcListParams(params, pageSize),
    Status: filters.status ?? null,
    Priority: filters.priority ?? null,
    ProjectOrActivity: filters.projectOrActivity ?? null,
  });
  return rows.map((r) => todoItemListRowSchema.parse(r));
}

export async function updateTodoItem(
  input: UpdateTodoItemInput,
  actorUserId: number,
): Promise<TodoItemRow> {
  const parsed = updateTodoItemInput.parse(input);
  const rows = await execProc<TodoItemRow>("usp_TodoItem_Update", {
    TodoItemId: parsed.todoItemId,
    ProjectId: parsed.projectId ?? null,
    ...toProcParams(parsed),
    RowVer: parsed.rowVer,
    ActorUserId: actorUserId,
  });
  return todoItemRowSchema.parse(rows[0]);
}

export async function deleteTodoItem(
  todoItemId: number,
  rowVer: number,
  actorUserId: number,
): Promise<void> {
  await execProc("usp_TodoItem_Delete", {
    TodoItemId: todoItemId,
    RowVer: rowVer,
    ActorUserId: actorUserId,
  });
}

/**
 * Returns overdue and approaching-deadline to-do alert rows for the current user
 * (cross-project). Mirrors the Access qryUpcomingAlerts business logic.
 *
 * Named getUpcomingAlertRows (not getUpcomingAlerts) to distinguish from
 * @/lib/repositories/upcoming-alerts.ts#getUpcomingAlerts which returns the
 * lightweight UpcomingAlert shape used by the shell header bell.
 */
export async function reorderTodoItem(
  input: ReorderTodoItemInput,
  actorUserId: number,
): Promise<TodoItemRow> {
  const parsed = reorderTodoItemInput.parse(input);
  const rows = await execProc<TodoItemRow>("usp_TodoItem_Reorder", {
    TodoItemId: parsed.todoItemId,
    NewSortKey: parsed.newSortKey,
    RowVer: parsed.rowVer,
    ActorUserId: actorUserId,
  });
  if (!rows[0]) throw new AppError("NOT_FOUND", "TodoItem not found");
  return todoItemRowSchema.parse(rows[0]);
}

export async function getUpcomingAlertRows(actorUserId: number): Promise<UpcomingAlertRow[]> {
  const rows = await execProc<UpcomingAlertRow>("usp_Todo_GetUpcomingAlerts", {
    ActorUserId: actorUserId,
  });
  return rows.map((r) => upcomingAlertRowSchema.parse(r));
}

/**
 * Returns alerts whose AlertDay = today (UTC) and AlertTime <= now (UTC).
 * Used by the 60-second client poller to fire browser notifications.
 * Reuses the UpcomingAlertRow shape — proc returns the same columns.
 */
export async function getDueAlerts(actorUserId: number): Promise<DueAlertRow[]> {
  const rows = await execProc<DueAlertRow>("usp_Todo_GetDueAlerts", {
    ActorUserId: actorUserId,
  });
  return rows.map((r) => dueAlertRowSchema.parse(r));
}

/**
 * Create a TodoItem from a DailyActivity row (req 13.1 — "built from daily activity list").
 * Calls usp_Todo_BuildFromDailyActivity which copies Task → TodoItem, RequestDate → StartDate,
 * and enforces the one-to-one guard (DUPLICATE when a todo already links this activity).
 */
export async function buildTodoFromDailyActivity(
  dailyActivityId: number,
  actorUserId: number,
): Promise<TodoItemRow> {
  const rows = await execProc<TodoItemRow>("usp_Todo_BuildFromDailyActivity", {
    DailyActivityId: dailyActivityId,
    ActorUserId: actorUserId,
  });
  if (!rows[0]) throw new AppError("NOT_FOUND", "TodoItem not found after build");
  return todoItemRowSchema.parse(rows[0]);
}
