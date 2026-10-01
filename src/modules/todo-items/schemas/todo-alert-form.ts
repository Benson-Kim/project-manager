import { z } from "zod";
import { messages } from "@/lib/messages";
import { REPEAT_UNITS, rowVerSchema, snoozeOptionsSchema } from "./todo-alert";

/**
 * TodoAlert form contract: ONE schema shared by the client alert
 * section and the server actions. FormData values are strings — coerced here.
 */

const dateInput = z
  .string()
  .trim()
  .optional()
  .refine((v) => !v || !Number.isNaN(Date.parse(v)), messages.todoItems.invalidDate)
  .transform((v) => (v ? new Date(v) : null));

const optionalInt = (min = 0, max = 999) =>
  z
    .string()
    .trim()
    .optional()
    .refine(
      (v) => !v || (Number.isInteger(Number(v)) && Number(v) >= min && Number(v) <= max),
      messages.errors.VALIDATION,
    )
    .transform((v) => (v ? Number(v) : null));

const vocab = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || (values as readonly string[]).includes(v), messages.errors.VALIDATION)
    .transform((v) => (v ? (v as T[number]) : null));

export const todoAlertFormSchema = z
  .object({
    todoItemId: z.coerce.number().int().positive(),
    alertDay: dateInput,
    alertTime: z
      .string()
      .trim()
      .optional()
      .refine(
        (v) => !v || /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(v),
        messages.errors.VALIDATION,
      )
      .transform((v) => (v ? v : null)),
    repeatUnit: vocab(REPEAT_UNITS),
    repeatInterval: optionalInt(1, 999),
    maxSnoozeCount: optionalInt(0, 99),
    snoozeOptions: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v ? v : null))
      .pipe(snoozeOptionsSchema.nullable()),
    isDismissed: z
      .string()
      .optional()
      .transform((v) => v === "true"),
  })
  .superRefine((parsed, ctx) => {
    // Both delivery queries (foreground poll and push dispatch) filter on
    // AlertDay IS NOT NULL.  An active alert without a day can never become
    // due, so reject it here rather than letting it reach the database.
    if (!parsed.isDismissed && parsed.alertDay === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: messages.todoItems.alertDayRequired,
        path: ["alertDay"],
      });
    }
  });

export type TodoAlertFormValues = z.output<typeof todoAlertFormSchema>;

export const updateTodoAlertFormSchema = todoAlertFormSchema.extend({
  todoAlertId: z.coerce.number().int().positive(),
  rowVer: rowVerSchema,
});

export type UpdateTodoAlertFormValues = z.output<typeof updateTodoAlertFormSchema>;
