import { z } from "zod";

/**
 * Shared rowVer schema — bigint from SQL ROWVERSION cast to BIGINT, returned as
 * a numeric string by mssql; coerced to number for transport.
 */
export const rowVerSchema = z.union([z.string(), z.number()]).transform((v) => Number(v));

/**
 * TodoAlert (app.TodoAlert ← tblTodoList alert columns, 1:1 with TodoItem) — zod contracts.
 * Row schema mirrors the SELECT shape of usp_TodoAlert_{Create,GetById,Update}.
 */

/** Repeat unit vocabulary (Hour/Day/Week/Month). */
export const REPEAT_UNITS = ["Hour", "Day", "Week", "Month"] as const;

export const todoAlertRowSchema = z.object({
  TodoAlertId: z.number().int(),
  TodoItemId: z.number().int(),
  AlertDay: z.date().nullable(),
  AlertTime: z.string().nullable(), // TIME(0) comes back as "HH:mm:ss" string
  RepeatUnit: z.string().nullable(),
  RepeatInterval: z.number().int().nullable(),
  CurrentRepeatInterval: z.number().int().nullable(),
  SnoozeCount: z.number().int().nullable(),
  LastSnoozeTime: z.date().nullable(),
  MaxSnoozeCount: z.number().int().nullable(),
  SnoozeOptions: z.string().nullable(),
  IsDismissed: z.boolean(),
  CreatedAtUtc: z.date(),
  UpdatedAtUtc: z.date().nullable(),
  RowVer: rowVerSchema,
});

export type TodoAlertRow = z.infer<typeof todoAlertRowSchema>;

export const createTodoAlertInput = z.object({
  todoItemId: z.number().int().positive(),
  alertDay: z.coerce.date().nullish(),
  alertTime: z.string().trim().nullish(),
  repeatUnit: z.string().trim().max(50).nullish(),
  repeatInterval: z.number().int().positive().nullish(),
  currentRepeatInterval: z.number().int().positive().nullish(),
  snoozeCount: z.number().int().min(0).nullish(),
  lastSnoozeTime: z.coerce.date().nullish(),
  maxSnoozeCount: z.number().int().positive().nullish(),
  snoozeOptions: z.string().trim().max(255).nullish(),
  isDismissed: z.boolean(),
});

export type CreateTodoAlertInput = z.input<typeof createTodoAlertInput>;
export type CreateTodoAlertParsed = z.infer<typeof createTodoAlertInput>;

export const updateTodoAlertInput = createTodoAlertInput.extend({
  todoAlertId: z.number().int().positive(),
  rowVer: rowVerSchema,
});

export type UpdateTodoAlertInput = z.input<typeof updateTodoAlertInput>;

export const deleteTodoAlertInput = z.object({
  todoAlertId: z.coerce.number().int().positive(),
  rowVer: rowVerSchema,
});

export type DeleteTodoAlertInput = z.input<typeof deleteTodoAlertInput>;
