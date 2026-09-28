import { execProc } from "@/lib/db";
import { z } from "zod";
import {
  createTodoAlertInput,
  todoAlertRowSchema,
  updateTodoAlertInput,
  rowVerSchema,
  type CreateTodoAlertInput,
  type CreateTodoAlertParsed,
  type TodoAlertRow,
  type UpdateTodoAlertInput,
} from "../schemas/todo-alert";

/**
 * TodoAlert repository — stored procedures only.
 * One TodoAlert per TodoItem (1:1, enforced by UQ_TodoAlert_TodoItem in DB).
 */

/** Input schema for snooze (validated before the proc call). */
const snoozeInput = z.object({
  todoAlertId: z.number().int().positive(),
  snoozeMinutes: z.number().int().min(1).max(1440),
  rowVer: rowVerSchema,
});

/** Input schema for dismiss (validated before the proc call). */
const dismissInput = z.object({
  todoAlertId: z.number().int().positive(),
  rowVer: rowVerSchema,
});

export type SnoozeInput = z.input<typeof snoozeInput>;
export type DismissInput = z.input<typeof dismissInput>;

function toProcParams(input: CreateTodoAlertParsed) {
  return {
    AlertDay: input.alertDay ?? null,
    AlertTime: input.alertTime ?? null,
    RepeatUnit: input.repeatUnit ?? null,
    RepeatInterval: input.repeatInterval ?? null,
    CurrentRepeatInterval: input.currentRepeatInterval ?? null,
    SnoozeCount: input.snoozeCount ?? null,
    LastSnoozeTime: input.lastSnoozeTime ?? null,
    MaxSnoozeCount: input.maxSnoozeCount ?? null,
    SnoozeOptions: input.snoozeOptions ?? null,
    IsDismissed: input.isDismissed,
  };
}

export async function createTodoAlert(
  input: CreateTodoAlertInput,
  actorUserId: number,
): Promise<TodoAlertRow> {
  const parsed = createTodoAlertInput.parse(input);
  const rows = await execProc<TodoAlertRow>("usp_TodoAlert_Create", {
    TodoItemId: parsed.todoItemId,
    ...toProcParams(parsed),
    ActorUserId: actorUserId,
  });
  return todoAlertRowSchema.parse(rows[0]);
}

export async function getTodoAlertById(
  todoAlertId: number,
  actorUserId: number,
): Promise<TodoAlertRow> {
  const rows = await execProc<TodoAlertRow>("usp_TodoAlert_GetById", {
    TodoAlertId: todoAlertId,
    ActorUserId: actorUserId,
  });
  return todoAlertRowSchema.parse(rows[0]);
}

export async function updateTodoAlert(
  input: UpdateTodoAlertInput,
  actorUserId: number,
): Promise<TodoAlertRow> {
  const parsed = updateTodoAlertInput.parse(input);
  const rows = await execProc<TodoAlertRow>("usp_TodoAlert_Update", {
    TodoAlertId: parsed.todoAlertId,
    TodoItemId: parsed.todoItemId,
    ...toProcParams(parsed),
    RowVer: parsed.rowVer,
    ActorUserId: actorUserId,
  });
  return todoAlertRowSchema.parse(rows[0]);
}

export async function deleteTodoAlert(
  todoAlertId: number,
  rowVer: number,
  actorUserId: number,
): Promise<void> {
  await execProc("usp_TodoAlert_Delete", {
    TodoAlertId: todoAlertId,
    RowVer: rowVer,
    ActorUserId: actorUserId,
  });
}

/**
 * Returns the single active TodoAlert for the given TodoItemId, or null if none.
 * Uses usp_TodoAlert_List with TodoItemId filter (1:1 relationship; returns ≤ 1 row).
 */
export async function getTodoAlertByTodoItemId(
  todoItemId: number,
  actorUserId: number,
): Promise<TodoAlertRow | null> {
  const rows = await execProc<TodoAlertRow & { TotalCount: number }>("usp_TodoAlert_List", {
    ActorUserId: actorUserId,
    TodoItemId: todoItemId,
    Page: 1,
    PageSize: 1,
  });
  if (!rows[0]) return null;
  return todoAlertRowSchema.parse(rows[0]);
}

/**
 * Snooze a TodoAlert by the given number of minutes (req: pop-up alerts with snooze intervals).
 * Increments SnoozeCount; enforces MaxSnoozeCount; pushes AlertDay/AlertTime forward.
 * Returns the updated TodoAlertRow (new RowVer for the caller to store).
 */
export async function snoozeTodoAlert(
  input: SnoozeInput,
  actorUserId: number,
): Promise<TodoAlertRow> {
  const parsed = snoozeInput.parse(input);
  const rows = await execProc<TodoAlertRow>("usp_Todo_Snooze", {
    TodoAlertId: parsed.todoAlertId,
    SnoozeMinutes: parsed.snoozeMinutes,
    RowVer: parsed.rowVer,
    ActorUserId: actorUserId,
  });
  return todoAlertRowSchema.parse(rows[0]);
}

/**
 * Dismiss a TodoAlert so it no longer surfaces in upcoming alerts
 * (req: dismiss action per the Access qryUpcomingAlerts "IsDismissed" field).
 * Returns the updated TodoAlertRow.
 */
export async function dismissTodoAlert(
  input: DismissInput,
  actorUserId: number,
): Promise<TodoAlertRow> {
  const parsed = dismissInput.parse(input);
  const rows = await execProc<TodoAlertRow>("usp_Todo_Dismiss", {
    TodoAlertId: parsed.todoAlertId,
    RowVer: parsed.rowVer,
    ActorUserId: actorUserId,
  });
  return todoAlertRowSchema.parse(rows[0]);
}
