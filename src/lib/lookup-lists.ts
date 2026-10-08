import { z } from "zod";
import { messages } from "./messages";

/**
 * Managed dropdown lists (ADR-0022): every dropdown vocabulary lives in
 * app.LookupList / app.LookupOption, seeded by migration 018 and edited by
 * Admins from the datasheet header ("Edit dropdown list: X", ADR-0023).
 * Records store the option's label as text — except
 * app.DailyActivity.ActivityStatusId, which stores the option id.
 *
 * This registry names every list the app reads; src/tests/lookup-lists.test.ts
 * keeps it equal to the lists migration 018 seeds and to the rename cascade in
 * dbo.usp_LookupList_Set.
 */
export const LOOKUP_LISTS = [
  "project.status",
  "project.priority",
  "project.phase",
  "project.risk-level",
  "stakeholder.communication-preference",
  "stakeholder.engagement-level",
  "supplier.rating",
  "key-deliverable.status",
  "key-deliverable.priority",
  "question-answer.category",
  "question-answer.priority",
  "assumption-constraint.type",
  "assumption-constraint.impact",
  "daily-activity.status",
  "daily-activity.contact-method",
  "daily-activity.task-type",
  "todo-item.status",
  "todo-item.priority",
] as const;

export type LookupListKey = (typeof LOOKUP_LISTS)[number];

/** Lists whose records store the option id rather than its label. */
export const ID_BOUND_LISTS: readonly LookupListKey[] = ["daily-activity.status"];

/** Longest option label: the narrowest column a list is bound to (app.Project, NVARCHAR(50)). */
export const LOOKUP_LABEL_MAX = 50;

export interface LookupOption {
  id: number;
  label: string;
  /** A label the code reads by name: it can be moved, not renamed or removed. */
  locked: boolean;
}

export interface LookupList {
  key: LookupListKey;
  /** app.LookupList.RowVer as read — sent back when saving (CONFLICT when stale). */
  rowVer: number;
  /** Live options in display order. */
  options: LookupOption[];
}

export type LookupLists = Partial<Record<LookupListKey, LookupList>>;

/** One row of dbo.usp_LookupList_GetOptions / _Set (an empty list is one row with NULL option columns). */
export const lookupOptionRowSchema = z.object({
  ListKey: z.enum(LOOKUP_LISTS),
  ListRowVer: z.coerce.number().int().nonnegative(),
  LookupOptionId: z.number().int().nullable(),
  Label: z.string().nullable(),
  SortOrder: z.number().int().nullable(),
  IsLocked: z.boolean().nullable(),
});

export type LookupOptionRow = z.infer<typeof lookupOptionRowSchema>;

/** Groups proc rows (already ordered by list, then SortOrder) into lists. */
export function groupLookupRows(rows: readonly LookupOptionRow[]): LookupLists {
  const lists: LookupLists = {};
  for (const row of rows) {
    const list = (lists[row.ListKey] ??= { key: row.ListKey, rowVer: row.ListRowVer, options: [] });
    if (row.LookupOptionId !== null && row.Label !== null) {
      list.options.push({
        id: row.LookupOptionId,
        label: row.Label,
        locked: row.IsLocked === true,
      });
    }
  }
  return lists;
}

/** Saving one list from the editor: the whole list in display order (null id = new option). */
export const saveLookupListInput = z
  .object({
    listKey: z.enum(LOOKUP_LISTS),
    rowVer: z.coerce.number().int().nonnegative(),
    options: z
      .array(
        z.object({
          id: z.number().int().positive().nullable(),
          label: z
            .string()
            .trim()
            .min(1, messages.lookupLists.labelRequired)
            .max(LOOKUP_LABEL_MAX, messages.lookupLists.labelTooLong(LOOKUP_LABEL_MAX)),
        }),
      )
      .max(200),
  })
  .superRefine((input, ctx) => {
    const seen = new Set<string>();
    input.options.forEach((option, index) => {
      const key = option.label.toLocaleLowerCase();
      if (seen.has(key)) {
        ctx.addIssue({
          code: "custom",
          path: ["options", index, "label"],
          message: messages.lookupLists.labelDuplicate,
        });
      }
      seen.add(key);
    });
  });

export type SaveLookupListInput = z.input<typeof saveLookupListInput>;

/**
 * A value bound to a label-stored list (repository inputs, filters). Only its
 * shape is checked here; the proc checks it against the live list
 * (dbo.usp_LookupList_AssertLabel), which also keeps a record's retired value.
 */
export const listValue = z.string().trim().max(LOOKUP_LABEL_MAX);

/** A form field bound to a label-stored list: FormData sends "" for "no choice" (→ null). */
export const listChoice = listValue.optional().transform((value) => value || null);

export interface ListChoice {
  value: string;
  label: string;
}

/**
 * What a list-bound select offers: the live options, plus the record's current
 * value when that option was retired or renamed away — so the field never shows
 * blank and saving an untouched record keeps its value. Id-bound lists use the
 * option id as the value.
 */
export function listChoices(
  list: LookupList | undefined,
  byId: boolean,
  current?: { value: string; label: string | null } | null,
): ListChoice[] {
  const choices = (list?.options ?? []).map((option) => ({
    value: byId ? String(option.id) : option.label,
    label: option.label,
  }));
  if (current?.value && !choices.some((choice) => choice.value === current.value)) {
    choices.push({ value: current.value, label: current.label ?? current.value });
  }
  return choices;
}
