"use server";

import { action } from "@/lib/action";
import { createTodoItem, updateTodoItem, deleteTodoItem } from "../repository/todo-items";
import { createTodoAlert, updateTodoAlert, deleteTodoAlert } from "../repository/todo-alerts";
import { todoItemFormSchema, updateTodoItemFormSchema } from "../schemas/todo-item-form";
import { todoAlertFormSchema, updateTodoAlertFormSchema } from "../schemas/todo-alert-form";
import { deleteTodoItemInput } from "../schemas/todo-item";
import { deleteTodoAlertInput } from "../schemas/todo-alert";

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
