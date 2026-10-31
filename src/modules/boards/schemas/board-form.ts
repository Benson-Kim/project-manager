import { z } from "zod";

/** FormData strings enter the same allow-listed contract used by the server action. */
export function boardFormSchema<T extends z.ZodType>(
  schema: T,
  defaults: Record<string, unknown> = {},
) {
  return z.preprocess((raw) => {
    const parsed = z.record(z.string(), z.unknown()).safeParse(raw);
    if (!parsed.success) return raw;
    const record = parsed.data;
    const values = { ...defaults, ...record };
    for (const key of [
      "projectId",
      "boardColumnId",
      "boardSprintId",
      "boardPhaseId",
      "assigneeUserId",
      "targetColumnId",
      "unfinishedToSprintId",
      "toColumnId",
      "toSprintId",
      "beforeCardId",
      "storyPoints",
      "wipLimit",
    ]) {
      if (typeof values[key] === "string")
        values[key] = values[key] === "" ? null : Number(values[key]);
    }
    for (const key of ["dueDate", "startDate", "endDate", "color", "title"]) {
      if (values[key] === "") values[key] = null;
    }
    if ("removeForeignCards" in defaults)
      values.removeForeignCards = record.removeForeignCards === "on";
    return values;
  }, schema);
}

/** An issue on a value the form does not draw (an id it was opened with) has no Field to show it. */
export function hasUnshownIssue(error: z.ZodError, drawn: (name: string) => boolean) {
  return error.issues.some((issue) => !drawn(String(issue.path[0] ?? "")));
}
