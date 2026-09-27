import { z } from "zod";
import { messages } from "@/lib/messages";
import { PROJECT_OR_ACTIVITY, TODO_PRIORITIES, TODO_STATUSES } from "./todo-item";

/**
 * TodoItem form contract: ONE schema shared by the client sheet
 * form (blur + submit validation over FormData strings) and the server actions.
 * FormData values are strings — coerced to typed values here.
 */

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null));

const optionalLongText = () =>
  z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null));

const dateInput = z
  .string()
  .trim()
  .optional()
  .refine((v) => !v || !Number.isNaN(Date.parse(v)), messages.todoItems.invalidDate)
  .transform((v) => (v ? new Date(v) : null));

const vocab = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || (values as readonly string[]).includes(v), messages.errors.VALIDATION)
    .transform((v) => (v ? (v as T[number]) : null));

export const todoItemFormSchema = z.object({
  projectId: z.coerce.number().int().nullable(),
  dailyActivityId: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? Number(v) : null))
    .pipe(z.number().int().positive().nullable()),
  projectOrActivity: vocab(PROJECT_OR_ACTIVITY),
  todoItem: z.string().trim().min(1, messages.todoItems.todoItemRequired).max(255),
  startDate: dateInput,
  dueDate: dateInput,
  priority: vocab(TODO_PRIORITIES),
  status: vocab(TODO_STATUSES),
  notes: optionalLongText(),
});

export type TodoItemFormValues = z.output<typeof todoItemFormSchema>;

export const updateTodoItemFormSchema = todoItemFormSchema.extend({
  todoItemId: z.coerce.number().int().positive(),
  rowVer: z.coerce.number().int().nonnegative(),
});

export type UpdateTodoItemFormValues = z.output<typeof updateTodoItemFormSchema>;
