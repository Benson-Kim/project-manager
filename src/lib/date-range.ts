import type { z } from "zod";

export interface DatePair {
  /** Form field of the earlier date. */
  start: string;
  /** Form field of the later date; the issue is reported here. */
  end: string;
  message: string;
}

/**
 * A form schema's superRefine: each pair's end date may not fall before its
 * start date. The issue sits on the end field, so the sheet shows it under that
 * field and the datasheet toast reads it. Empty dates pass, and so does a date
 * that failed to parse (its own field already carries that error).
 */
export function datesInOrder(...pairs: DatePair[]) {
  return (value: Record<string, unknown>, ctx: z.RefinementCtx) => {
    for (const { start, end, message } of pairs) {
      const from = value[start];
      const to = value[end];
      if (from instanceof Date && to instanceof Date && to.getTime() < from.getTime()) {
        ctx.addIssue({ code: "custom", path: [end], message });
      }
    }
  };
}
