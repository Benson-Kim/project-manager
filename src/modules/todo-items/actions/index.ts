"use server";

import { z } from "zod";
import { action } from "@/lib/action";
import { auth } from "@/lib/auth/provider";
import { messages } from "@/lib/messages";
import {
  buildTodoFromDailyActivity,
  createTodoItem,
  deleteTodoItem,
  getDueAlerts,
  reorderTodoItem,
  updateTodoItem,
} from "../repository/todo-items";
import {
  createTodoAlert,
  deleteTodoAlert,
  dismissTodoAlert,
  snoozeTodoAlert,
  updateTodoAlert,
} from "../repository/todo-alerts";
import { todoItemFormSchema, updateTodoItemFormSchema } from "../schemas/todo-item-form";
import { todoAlertFormSchema, updateTodoAlertFormSchema } from "../schemas/todo-alert-form";
import { deleteTodoItemInput, reorderTodoItemInput } from "../schemas/todo-item";
import { deleteTodoAlertInput, rowVerSchema } from "../schemas/todo-alert";

/**
 * Create a to-do item (RBAC todo-items:create — Admin + PM; audited in-proc).
 * The page is dynamic (session cookie) — router.refresh() in the sheet, no
 * static path to revalidate.
 */
export const createTodoItemAction = action({
  name: "todo-items.create",
  schema: todoItemFormSchema,
  permission: "todo-items:create",
  handler: (input, ctx) => createTodoItem(input, ctx.session.userId),
});

/** Update a to-do item (RBAC todo-items:update — Admin + PM; CONFLICT on stale RowVer). */
export const updateTodoItemAction = action({
  name: "todo-items.update",
  schema: updateTodoItemFormSchema,
  permission: "todo-items:update",
  handler: (input, ctx) => updateTodoItem(input, ctx.session.userId),
});

/** Soft-delete a to-do item (RBAC todo-items:delete — Admin + PM; audited in-proc). */
export const deleteTodoItemAction = action({
  name: "todo-items.delete",
  schema: deleteTodoItemInput,
  permission: "todo-items:delete",
  handler: async (input, ctx) => {
    await deleteTodoItem(input.todoItemId, input.rowVer, ctx.session.userId);
    return { todoItemId: input.todoItemId };
  },
});

/**
 * Reorder a to-do item (req 13.2 — line items orderable in any order).
 * RBAC: todo-items:update — same gate as an edit (Admin + PM).
 * The proc bumps SortKey on adjacent items and audits the move in-transaction.
 */
export const reorderTodoItemAction = action({
  name: "todo-items.reorder",
  schema: reorderTodoItemInput,
  permission: "todo-items:update",
  handler: (input, ctx) => reorderTodoItem(input, ctx.session.userId),
});

/**
 * Create a todo alert (RBAC todo-alerts:create — Contributors included per
 * PLAN.md §9 CONTRIBUTOR_WRITE_MODULES; audited in-proc).
 */
export const createTodoAlertAction = action({
  name: "todo-alerts.create",
  schema: todoAlertFormSchema,
  permission: "todo-alerts:create",
  handler: (input, ctx) => createTodoAlert(input, ctx.session.userId),
});

/** Update a todo alert (RBAC todo-alerts:update — Contributors included). */
export const updateTodoAlertAction = action({
  name: "todo-alerts.update",
  schema: updateTodoAlertFormSchema,
  permission: "todo-alerts:update",
  handler: (input, ctx) => updateTodoAlert(input, ctx.session.userId),
});

/** Soft-delete a todo alert (RBAC todo-alerts:delete). */
export const deleteTodoAlertAction = action({
  name: "todo-alerts.delete",
  schema: deleteTodoAlertInput,
  permission: "todo-alerts:delete",
  handler: async (input, ctx) => {
    await deleteTodoAlert(input.todoAlertId, input.rowVer, ctx.session.userId);
    return { todoAlertId: input.todoAlertId };
  },
});

/**
 * Snooze a todo alert (RBAC todo-alerts:update; increments SnoozeCount; pushes AlertDay/Time forward).
 */
export const snoozeTodoAlertAction = action({
  name: "todo-alerts.snooze",
  schema: z.object({
    todoAlertId: z.coerce.number().int().positive(),
    snoozeMinutes: z.coerce.number().int().min(1).max(1440),
    rowVer: rowVerSchema,
  }),
  permission: "todo-alerts:update",
  handler: (input, ctx) => snoozeTodoAlert(input, ctx.session.userId),
});

/**
 * Dismiss a todo alert (RBAC todo-alerts:update; sets IsDismissed = true permanently).
 */
export const dismissTodoAlertAction = action({
  name: "todo-alerts.dismiss",
  schema: z.object({
    todoAlertId: z.coerce.number().int().positive(),
    rowVer: rowVerSchema,
  }),
  permission: "todo-alerts:update",
  handler: (input, ctx) => dismissTodoAlert(input, ctx.session.userId),
});

/**
 * Build a TodoItem from a DailyActivity row (req 13.1 — "built from daily activity list").
 * RBAC: todo-items:create — Admin + PM. The proc enforces DUPLICATE prevention server-side.
 */
export const buildTodoFromDailyActivityAction = action({
  name: "todo-items.buildFromDailyActivity",
  schema: z.object({
    dailyActivityId: z.coerce.number().int().positive(),
  }),
  permission: "todo-items:create",
  handler: (input, ctx) => buildTodoFromDailyActivity(input.dailyActivityId, ctx.session.userId),
});

/**
 * Poll for alerts that are due right now (AlertDay = today UTC, AlertTime <=
 * current UTC time). Called every 60 s by useAlertPoller on the client.
 * Returns a plain array — not wrapped in ActionResult — so the poller can
 * call it directly without the action() overhead (it's a read, not a mutation).
 */
export async function pollDueAlertsAction(): Promise<
  Array<{ todoAlertId: number; todoItemId: number; title: string; rowVer: number }>
> {
  const session = await auth.getSession();
  if (!session) return [];
  const rows = await getDueAlerts(session.userId).catch(() => []);
  return rows.map((r) => ({
    todoAlertId: r.TodoAlertId,
    todoItemId: r.TodoItemId,
    title: r.TodoItem ?? messages.app.untitled,
    rowVer: r.RowVer,
  }));
}
