import { z } from "zod";
import { toDateInput } from "@/lib/format";

export interface DatePair {
  /** Form field of the earlier date. */
  start: string;
  /** Form field of the later date; the issue is reported here. */
  end: string;
  message: string;
}

/** The field an update form carries a date's stored value in ("YYYY-MM-DD", or ""). */
const was = (field: string) => `${field}Was`;

/**
 * A form schema's superRefine: each pair's end date may not fall before its
 * start date. The issue sits on the end field, so the sheet shows it under that
 * field and the datasheet toast reads it. Empty dates pass, and so does a date
 * that failed to parse (its own field already carries that error).
 *
 * An update form also sends each date's stored value (datesWere). A pair that
 * is still exactly what is stored passes: a record saved with its dates
 * inverted before this rule existed can be edited without rewriting them. The
 * Update procs apply the same rule against the row itself.
 */
export function datesInOrder(...pairs: DatePair[]) {
  return (value: Record<string, unknown>, ctx: z.RefinementCtx) => {
    const unchanged = (field: string) => {
      const stored = value[was(field)];
      const date = value[field];
      return typeof stored === "string" && date instanceof Date && toDateInput(date) === stored;
    };
    for (const { start, end, message } of pairs) {
      const from = value[start];
      const to = value[end];
      if (
        from instanceof Date &&
        to instanceof Date &&
        to.getTime() < from.getTime() &&
        !(unchanged(start) && unchanged(end))
      ) {
        ctx.addIssue({ code: "custom", path: [end], message });
      }
    }
  };
}

type DatesWere<F extends string> = { [K in F as `${K}Was`]: z.ZodOptional<z.ZodString> };

/**
 * The update form fields that carry the dates' stored values, for
 * datesInOrder: hidden inputs in the sheet, and the row's values in a
 * datasheet edit (formCellSaver).
 */
export function datesWere<const F extends string>(...fields: F[]): DatesWere<F> {
  return Object.fromEntries(
    fields.map((field) => [was(field), z.string().trim().optional()]),
  ) as DatesWere<F>;
}

/** The stored dates as datesWere's form values. */
export function storedDates<const F extends string>(
  dates: Record<F, Date | null | undefined>,
): Record<`${F}Was`, string> {
  return Object.fromEntries(
    Object.entries<Date | null | undefined>(dates).map(([field, date]) => [
      was(field),
      toDateInput(date),
    ]),
  ) as Record<`${F}Was`, string>;
}
