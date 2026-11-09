import { execProc } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { parseLocalWallClock } from "@/lib/local-time";
import { DEFAULT_PAGE_SIZE, toProcListParams, type ListParams } from "@/lib/list-params";
import { nextOpenOccurrence } from "../recurrence";
import { listedSeriesSchema } from "../schemas/todo-recurrence";
import {
  createTodoItemInput,
  dueAlertRowSchema,
  isClosedStatus,
  reorderTodoItemInput,
  todoItemListRowSchema,
  todoItemRowSchema,
  updateTodoItemInput,
  upcomingAlertRowSchema,
  type CreateTodoItemInput,
  type CreateTodoItemParsed,
  type DueAlertRow,
  type NextOccurrence,
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
    Assignee: input.assignee ?? null,
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
): Promise<TodoItemRow> {
  const rows = await execProc<TodoItemRow>("usp_TodoItem_GetById", {
    TodoItemId: todoItemId,
    ActorUserId: actorUserId,
  });
  if (!rows[0]) throw new AppError("NOT_FOUND", "TodoItem not found");
  return todoItemRowSchema.parse(rows[0]);
}

/** Module-specific filter params forwarded to usp_TodoItem_List. */
export interface TodoListFilters {
  status?: string | null;
  priority?: string | null;
  projectOrActivity?: string | null;
  /** Only project-less to-dos (the cross-project page's "No project" filter). */
  withoutProject?: boolean;
}

export async function listTodoItems(
  params: ListParams,
  actorUserId: number,
  projectId: number | null = null,
  pageSize: number = DEFAULT_PAGE_SIZE,
  filters: TodoListFilters = {},
): Promise<TodoItemListRow[]> {
  const rows = await execProc<TodoItemListRow>("usp_TodoItem_List", {
    ActorUserId: actorUserId,
    ProjectId: projectId,
    ...toProcListParams(params, pageSize),
    Status: filters.status ?? null,
    Priority: filters.priority ?? null,
    ProjectOrActivity: filters.projectOrActivity ?? null,
    WithoutProject: filters.withoutProject ?? false,
  });
  const today = new Date().toISOString().slice(0, 10);
  return rows.map((r) => {
    const row = todoItemListRowSchema.parse(r);
    return { ...row, Next: row.Repeats ? nextOccurrence(row, r, today) : null };
  });
}

/** A series row's next open occurrence, from the rule and occurrence rows the list returned. */
function nextOccurrence(
  row: { StartDate: Date | null; DueDate: Date | null },
  raw: unknown,
  today: string,
): NextOccurrence | null {
  if (row.StartDate === null) return null;
  const { rule, occurrences } = listedSeriesSchema.parse(raw);
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  const next = nextOpenOccurrence(
    { startDate: ymd(row.StartDate), dueDate: row.DueDate === null ? null : ymd(row.DueDate) },
    rule,
    occurrences.map((o) => ({ ...o, closed: isClosedStatus(o.status) })),
    today,
  );
  if (next === null) return null;
  return {
    StartDate: new Date(`${next.startsAt.slice(0, 10)}T00:00:00Z`),
    DueDate: next.dueDate === null ? null : new Date(`${next.dueDate}T00:00:00Z`),
  };
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
    LocalNow: parseLocalWallClock(parsed.localNow),
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
export async function getDueAlerts(
  actorUserId: number,
  /** The browser's wall-clock now (alerts are wall-clock times); null = UTC (server callers). */
  localNow: Date | null = null,
): Promise<DueAlertRow[]> {
  const rows = await execProc<DueAlertRow>("usp_Todo_GetDueAlerts", {
    ActorUserId: actorUserId,
    LocalNow: localNow,
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

/** The dated card's to-do and its alert; a card's existing to-do comes back with existed: true. */
export async function buildTodoFromBoardCard(
  boardCardId: number,
  actorUserId: number,
): Promise<{ todoItemId: number; existed: boolean }> {
  const rows = await execProc<{ TodoItemId: number; Existed: boolean }>(
    "usp_Todo_BuildFromBoardCard",
    { BoardCardId: boardCardId, ActorUserId: actorUserId },
  );
  if (!rows[0]) throw new AppError("NOT_FOUND", "TodoItem not found after build");
  return { todoItemId: rows[0].TodoItemId, existed: Boolean(rows[0].Existed) };
}
