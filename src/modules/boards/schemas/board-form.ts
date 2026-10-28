import { z } from "zod";

/** FormData strings enter the same allow-listed contract used by the server action. */
export function boardFormSchema<T extends z.ZodType>(
  schema: T,
  defaults: Record<string, unknown> = {},
) {
  return z.preprocess((raw) => {
    const record = z.record(z.string(), z.unknown()).parse(raw);
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
