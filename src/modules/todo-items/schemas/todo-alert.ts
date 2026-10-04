import { z } from "zod";
import { messages } from "@/lib/messages";

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

export function normalizeSnoozeOptions(value: string): string | null {
  const tokens = value.split(",").map((token) => token.trim());
  if (tokens.length === 0 || tokens.some((token) => !/^\d+$/.test(token))) {
    return null;
  }

  const minutes = tokens.map(Number);
  if (minutes.some((minute) => minute < 1 || minute > 1440)) {
    return null;
  }

  return [...new Set(minutes)].join(",");
}

export const snoozeOptionsSchema = z
  .string()
  .trim()
  .max(255)
  .refine(
    (value) => normalizeSnoozeOptions(value) !== null,
    messages.todoItems.invalidSnoozeOptions,
  )
  .transform((value) => normalizeSnoozeOptions(value)!);

/**
 * mssql returns SQL TIME(0) columns as JS Date objects (midnight base date +
 * the time offset). Normalise to "HH:mm:ss" string for consistent transport,
 * while also accepting a plain string (e.g. from test fixtures).
 */
export const alertTimeSchema = z
  .union([z.date(), z.string()])
  .nullable()
  .transform((v) => {
    if (v == null) return null;
    if (typeof v === "string") return v;
    // Date from mssql: extract UTC HH:mm:ss
    const hh = String(v.getUTCHours()).padStart(2, "0");
    const mm = String(v.getUTCMinutes()).padStart(2, "0");
    const ss = String(v.getUTCSeconds()).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  });

export const todoAlertRowSchema = z.object({
  TodoAlertId: z.number().int(),
  TodoItemId: z.number().int(),
  AlertDay: z.date().nullable(),
  AlertTime: alertTimeSchema,
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
  maxSnoozeCount: z.number().int().min(0).nullish(),
  snoozeOptions: snoozeOptionsSchema.nullish(),
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
