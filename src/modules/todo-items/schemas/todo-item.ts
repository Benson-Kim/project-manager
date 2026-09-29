import { z } from "zod";
import { alertTimeSchema, rowVerSchema } from "./todo-alert";

/**
 * TodoItem (app.TodoItem ← tblTodoList core columns) — zod contracts.
 * Row schema mirrors the SELECT shape of usp_TodoItem_{Create,GetById,List,Update}.
 */

/** Priority vocabulary (matches Access tblTodoList seed data — Critical first). */
export const TODO_PRIORITIES = ["Critical", "High", "Medium", "Low"] as const;

/**
 * Status vocabulary — matches Access tblTodoList data including "In Review"
 * which appears in live seed rows.
 */
export const TODO_STATUSES = [
  "Not Started",
  "In Progress",
  "In Review",
  "Completed",
  "Cancelled",
] as const;

/**
 * ProjectOrActivity — matches Access tblTodoList.ProjectOrActivity field values.
 * Source data shows "Project", "Daily Activity", and "None".
 */
export const PROJECT_OR_ACTIVITY = ["Project", "Daily Activity", "None"] as const;

export const todoItemRowSchema = z.object({
  TodoItemId: z.number().int(),
  ProjectId: z.number().int().nullable(),
  DailyActivityId: z.number().int().nullable(),
  ProjectOrActivity: z.string().nullable(),
  TodoItem: z.string().nullable(),
  StartDate: z.date().nullable(),
  DueDate: z.date().nullable(),
  Priority: z.string().nullable(),
  Status: z.string().nullable(),
  Notes: z.string().nullable(),
  /** Manual sort position (req 13.2). Added by migration 007; defaults to TodoItemId on legacy rows. */
  SortKey: z.number().int().default(0),
  CreatedAtUtc: z.date(),
  UpdatedAtUtc: z.date().nullable(),
  RowVer: rowVerSchema,
});

export type TodoItemRow = z.infer<typeof todoItemRowSchema>;

export const todoItemListRowSchema = todoItemRowSchema.extend({
  TotalCount: z.number().int(),
});

export type TodoItemListRow = z.infer<typeof todoItemListRowSchema>;

export const createTodoItemInput = z.object({
  projectId: z.number().int().positive().nullish(),
  dailyActivityId: z.number().int().positive().nullish(),
  projectOrActivity: z.string().trim().max(50).nullish(),
  todoItem: z.string().trim().min(1).max(255),
  startDate: z.coerce.date().nullish(),
  dueDate: z.coerce.date().nullish(),
  priority: z.string().trim().max(255).nullish(),
  status: z.string().trim().max(255).nullish(),
  notes: z.string().trim().nullish(),
});

export const reorderTodoItemInput = z.object({
  todoItemId: z.number().int().positive(),
  newSortKey: z.number().int().min(0),
  rowVer: rowVerSchema,
});

export type ReorderTodoItemInput = z.input<typeof reorderTodoItemInput>;

export type CreateTodoItemInput = z.input<typeof createTodoItemInput>;
export type CreateTodoItemParsed = z.infer<typeof createTodoItemInput>;

export const updateTodoItemInput = createTodoItemInput.extend({
  todoItemId: z.number().int().positive(),
  rowVer: rowVerSchema,
});

export type UpdateTodoItemInput = z.input<typeof updateTodoItemInput>;

export const deleteTodoItemInput = z.object({
  todoItemId: z.coerce.number().int().positive(),
  rowVer: rowVerSchema,
});

export type DeleteTodoItemInput = z.input<typeof deleteTodoItemInput>;

/**
 * Pure business-rule helper — mirrors Access qryUpcomingAlerts IIf chain.
 * Overdue = DueDate (UTC calendar day) < today (UTC calendar day) AND status is not terminal.
 * Terminal states from Access data: "Completed", "Cancelled" (matches qryUpcomingAlerts WHERE).
 * "In Review" is NOT terminal per Access qryInProgressToDo (which excludes "In Review" from
 * in-progress count but NOT from the upcoming-alerts query).
 * Uses UTC day comparison to match the proc's CAST(SYSUTCDATETIME() AS DATE) and avoid
 * timezone-driven false positives when called client-side.
 */
export function isOverdue(row: { DueDate: Date | null; Status: string | null }): boolean {
  if (!row.DueDate) return false;
  // "In Review" is intentionally NOT excluded — still an active/alertable state per qryUpcomingAlerts
  if (row.Status === "Completed" || row.Status === "Cancelled") return false;
  // Compare UTC calendar dates to match the proc: CAST(SYSUTCDATETIME() AS DATE).
  const todayUtc = new Date();
  todayUtc.setUTCHours(0, 0, 0, 0);
  const dueUtc = new Date(row.DueDate);
  dueUtc.setUTCHours(0, 0, 0, 0);
  return dueUtc < todayUtc;
}

/**
 * Approaching deadline = DueDate is within the next 2 UTC calendar days AND not already overdue.
 * Mirrors the Access qryUpcomingAlerts DATEADD(DAY, -2, DueDate) <= @Today tier.
 */
export function isApproachingDeadline(row: { DueDate: Date | null; Status: string | null }): boolean {
  if (!row.DueDate) return false;
  if (row.Status === "Completed" || row.Status === "Cancelled") return false;
  if (isOverdue(row)) return false;
  const todayUtc = new Date();
  todayUtc.setUTCHours(0, 0, 0, 0);
  const twoDaysFromNow = new Date(todayUtc);
  twoDaysFromNow.setUTCDate(twoDaysFromNow.getUTCDate() + 2);
  const dueUtc = new Date(row.DueDate);
  dueUtc.setUTCHours(0, 0, 0, 0);
  return dueUtc <= twoDaysFromNow;
}

/**
 * Upcoming alert row returned by usp_Todo_GetUpcomingAlerts.
 * The proc selects from app.TodoItem LEFT JOIN app.TodoAlert — it does NOT include
 * ProjectId in its SELECT list. Use TodoItemId to build the link via the /todo page.
 */
export const upcomingAlertRowSchema = z.object({
  TodoItemId: z.number().int(),
  TodoItem: z.string().nullable(),
  DueDate: z.date().nullable(),
  Priority: z.string().nullable(),
  Status: z.string().nullable(),
  AlertType: z.string(),
  TodoAlertId: z.number().int().nullable(),
  AlertDay: z.date().nullable(),
  AlertTime: alertTimeSchema,
  SnoozeCount: z.number().int().nullable(),
  MaxSnoozeCount: z.number().int().nullable(),
  IsDismissed: z.boolean().nullable(),
  RowVer: rowVerSchema,
});

export type UpcomingAlertRow = z.infer<typeof upcomingAlertRowSchema>;

/**
 * Slim row returned by usp_Todo_GetDueAlerts (the 60-s alert poller).
 * Only carries what the browser notification needs: the title and the IDs
 * required to dismiss/snooze.
 */
export const dueAlertRowSchema = z.object({
  TodoAlertId: z.number().int(),
  TodoItemId: z.number().int(),
  TodoItem: z.string().nullable(),
  AlertDay: z.date().nullable(),
  AlertTime: alertTimeSchema,
  SnoozeCount: z.number().int().nullable(),
  MaxSnoozeCount: z.number().int().nullable(),
  IsDismissed: z.boolean(),
  RowVer: rowVerSchema,
});

export type DueAlertRow = z.infer<typeof dueAlertRowSchema>;
