import { execProc } from "@/lib/db";
import {
  createPlannerEntryInput,
  plannerEntryRowSchema,
  plannerWindowInput,
  scheduledSlotRowSchema,
  scheduleTodoItemInput,
  unscheduleTodoItemInput,
  wallClockDate,
  type CreatePlannerEntryInput,
  type PlannerEntry,
  type ScheduledSlot,
  type ScheduleTodoItemInput,
  type UnscheduleTodoItemInput,
} from "../schemas/todo-schedule";

/** Place, move or stretch a to-do on the planner; its dates stay as they are. */
export async function scheduleTodoItem(
  input: ScheduleTodoItemInput,
  actorUserId: number,
): Promise<ScheduledSlot> {
  const parsed = scheduleTodoItemInput.parse(input);
  const rows = await execProc("usp_TodoItem_Schedule", {
    TodoItemId: parsed.todoItemId,
    ScheduledStart: wallClockDate(parsed.start),
    ScheduledEnd: wallClockDate(parsed.end),
    RowVer: parsed.rowVer,
    ActorUserId: actorUserId,
  });
  return scheduledSlotRowSchema.parse(rows[0]);
}

/** Take a to-do off the planner; the to-do itself stays. */
export async function unscheduleTodoItem(
  input: UnscheduleTodoItemInput,
  actorUserId: number,
): Promise<ScheduledSlot> {
  const parsed = unscheduleTodoItemInput.parse(input);
  const rows = await execProc("usp_TodoItem_Schedule", {
    TodoItemId: parsed.todoItemId,
    ScheduledStart: null,
    ScheduledEnd: null,
    RowVer: parsed.rowVer,
    ActorUserId: actorUserId,
  });
  return scheduledSlotRowSchema.parse(rows[0]);
}

/** A to-do typed into a planner slot: it starts that day and holds the slot. */
export async function createPlannerEntry(
  input: CreatePlannerEntryInput,
  actorUserId: number,
): Promise<ScheduledSlot> {
  const parsed = createPlannerEntryInput.parse(input);
  const rows = await execProc("usp_TodoItem_Create", {
    ProjectId: parsed.projectId ?? null,
    TodoItem: parsed.title,
    StartDate: new Date(`${parsed.start.slice(0, 10)}T00:00:00Z`),
    ScheduledStart: wallClockDate(parsed.start),
    ScheduledEnd: wallClockDate(parsed.end),
    ActorUserId: actorUserId,
  });
  return scheduledSlotRowSchema.parse(rows[0]);
}

/** The to-dos placed in a window of days (at most 31), oldest slot first. */
export async function listTodoSchedule(
  window: { from: string; to: string; projectId?: number | null },
  actorUserId: number,
): Promise<PlannerEntry[]> {
  const parsed = plannerWindowInput.parse(window);
  const rows = await execProc("usp_Todo_ListSchedule", {
    ActorUserId: actorUserId,
    ProjectId: parsed.projectId ?? null,
    From: parsed.from,
    To: parsed.to,
  });
  return rows.map((row) => plannerEntryRowSchema.parse(row));
}
