import { z } from "zod";
import { actorAccessSchema } from "@/lib/auth/actor-access";
import { messages } from "@/lib/messages";
import { rowVerSchema } from "./todo-alert";

const t = messages.todoItems.planner;

export const PLANNER_TIME = /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/;

/** "YYYY-MM-DDTHH:MM" wall clock, as a Date whose UTC fields hold it (the driver's convention). */
export function wallClockDate(value: string): Date {
  return new Date(`${value}:00Z`);
}

export function isPlannerTime(value: string): boolean {
  if (!PLANNER_TIME.test(value)) return false;
  const date = wallClockDate(value);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 16) === value;
}

export function nextMidnight(start: string): string {
  const day = new Date(`${start.slice(0, 10)}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + 1);
  return `${day.toISOString().slice(0, 10)}T00:00`;
}

export type SlotProblem = "order" | "midnight";

/** The slot rule the database holds (usp_TodoItem_AssertSlot, CK_TodoItem_Schedule). */
export function slotProblem(start: string, end: string): SlotProblem | null {
  if (end <= start) return "order";
  if (end > nextMidnight(start)) return "midnight";
  return null;
}

const plannerTime = z.string().refine(isPlannerTime, t.timeFormat);
const id = z.number().int().positive();

function checkSlot(value: { start: string; end: string }, ctx: z.RefinementCtx) {
  if (!isPlannerTime(value.start) || !isPlannerTime(value.end)) return;
  const problem = slotProblem(value.start, value.end);
  if (problem) ctx.addIssue({ code: "custom", path: ["end"], message: t[problem] });
}

export const scheduleTodoItemInput = z
  .strictObject({ todoItemId: id, start: plannerTime, end: plannerTime, rowVer: rowVerSchema })
  .superRefine(checkSlot);
export type ScheduleTodoItemInput = z.input<typeof scheduleTodoItemInput>;

export const unscheduleTodoItemInput = z.strictObject({ todoItemId: id, rowVer: rowVerSchema });
export type UnscheduleTodoItemInput = z.input<typeof unscheduleTodoItemInput>;

export const createPlannerEntryInput = z
  .strictObject({
    title: z.string().trim().min(1, t.titleRequired).max(255),
    projectId: id.nullable().optional(),
    start: plannerTime,
    end: plannerTime,
  })
  .superRefine(checkSlot);
export type CreatePlannerEntryInput = z.input<typeof createPlannerEntryInput>;

export const plannerWindowInput = z.strictObject({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  projectId: id.nullable().optional(),
});

const wallClock = z.date().transform((d) => d.toISOString().slice(0, 16));
const dateOnly = z
  .date()
  .nullable()
  .transform((d) => (d ? d.toISOString().slice(0, 10) : null));

export const scheduledSlotRowSchema = z
  .object({
    TodoItemId: z.number(),
    ScheduledStart: wallClock.nullable(),
    ScheduledEnd: wallClock.nullable(),
    RowVer: rowVerSchema,
  })
  .transform((r) => ({
    todoItemId: r.TodoItemId,
    start: r.ScheduledStart,
    end: r.ScheduledEnd,
    rowVer: r.RowVer,
  }));
export type ScheduledSlot = z.output<typeof scheduledSlotRowSchema>;

export const plannerEntryRowSchema = z
  .object({
    TodoItemId: z.number(),
    ProjectId: z.number().nullable(),
    ProjectName: z.string().nullable(),
    TodoItem: z.string(),
    StartDate: dateOnly,
    DueDate: dateOnly,
    Priority: z.string().nullable(),
    Status: z.string().nullable(),
    Assignee: z.string().nullable(),
    RowVer: rowVerSchema,
    ActorAccess: actorAccessSchema,
    ScheduledStart: wallClock,
    ScheduledEnd: wallClock,
  })
  .transform((r) => ({
    todoItemId: r.TodoItemId,
    projectId: r.ProjectId,
    projectName: r.ProjectName,
    title: r.TodoItem,
    startDate: r.StartDate,
    dueDate: r.DueDate,
    priority: r.Priority,
    status: r.Status,
    assignee: r.Assignee,
    rowVer: r.RowVer,
    actorAccess: r.ActorAccess,
    start: r.ScheduledStart,
    end: r.ScheduledEnd,
  }));
export type PlannerEntry = z.output<typeof plannerEntryRowSchema>;
