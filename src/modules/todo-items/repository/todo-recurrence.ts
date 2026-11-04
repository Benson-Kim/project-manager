import { execProc } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { parseLocalWallClock } from "@/lib/local-time";
import {
  clearTodoRecurrenceInput,
  setTodoOccurrenceInput,
  setTodoRecurrenceInput,
  todoOccurrenceRowSchema,
  todoRecurrenceRowSchema,
  type ClearTodoRecurrenceInput,
  type SetTodoOccurrenceInput,
  type SetTodoRecurrenceInput,
  type TodoOccurrenceRow,
  type TodoRecurrence,
} from "../schemas/todo-recurrence";

/**
 * How a to-do repeats, and one occurrence's own state — stored procedures only. A rule change
 * moves the series' RowVer, the one token for the to-do and its rule; an occurrence row has its
 * own RowVer and leaves the series' alone.
 */

/** How a to-do repeats; null when it does not. */
export async function getTodoRecurrence(
  todoItemId: number,
  actorUserId: number,
): Promise<TodoRecurrence | null> {
  const rows = await execProc("usp_TodoRecurrence_GetById", {
    TodoItemId: todoItemId,
    ActorUserId: actorUserId,
  });
  return rows[0] ? todoRecurrenceRowSchema.parse(rows[0]) : null;
}

export async function setTodoRecurrence(
  input: SetTodoRecurrenceInput,
  actorUserId: number,
): Promise<TodoRecurrence> {
  const { todoItemId, rowVer, rule, localNow } = setTodoRecurrenceInput.parse(input);
  const rows = await execProc("usp_TodoRecurrence_Set", {
    TodoItemId: todoItemId,
    RepeatUnit: rule.unit,
    RepeatEvery: rule.every,
    StartTime: rule.startTime,
    Weekdays: rule.weekdays,
    MonthMode: rule.monthMode,
    Ordinal: rule.ordinal,
    Weekday: rule.weekday,
    EndsOn: rule.endsOn,
    EndsAfter: rule.endsAfter,
    RowVer: rowVer,
    ActorUserId: actorUserId,
    LocalNow: parseLocalWallClock(localNow),
  });
  if (!rows[0]) throw new AppError("NOT_FOUND", "TodoItem not found");
  return todoRecurrenceRowSchema.parse(rows[0]);
}

/** Stops a to-do repeating; returns its new RowVer. */
export async function clearTodoRecurrence(
  input: ClearTodoRecurrenceInput,
  actorUserId: number,
): Promise<{ todoItemId: number; rowVer: number }> {
  const { todoItemId, rowVer } = clearTodoRecurrenceInput.parse(input);
  const rows = await execProc<{ TodoItemId: number; RowVer: number | string }>(
    "usp_TodoRecurrence_Clear",
    { TodoItemId: todoItemId, RowVer: rowVer, ActorUserId: actorUserId },
  );
  if (!rows[0]) throw new AppError("NOT_FOUND", "TodoItem not found");
  return { todoItemId: rows[0].TodoItemId, rowVer: Number(rows[0].RowVer) };
}

/** Marks, moves or skips one occurrence; null once it is back to plain (its row is deleted). */
export async function setTodoOccurrence(
  input: SetTodoOccurrenceInput,
  actorUserId: number,
): Promise<TodoOccurrenceRow | null> {
  const parsed = setTodoOccurrenceInput.parse(input);
  const rows = await execProc("usp_TodoOccurrence_Set", {
    TodoItemId: parsed.todoItemId,
    OccursAt: parseLocalWallClock(parsed.occursAt),
    Status: parsed.status,
    MovedTo: parseLocalWallClock(parsed.movedTo),
    IsSkipped: parsed.isSkipped,
    RowVer: parsed.rowVer,
    ActorUserId: actorUserId,
  });
  return rows[0] ? todoOccurrenceRowSchema.parse(rows[0]) : null;
}
