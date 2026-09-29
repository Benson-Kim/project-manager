import { execProc } from "@/lib/db";
import { z } from "zod";

/**
 * Lightweight option shape used to populate the "Linked daily activity"
 * combobox inside TodoItemSheet.  Only the columns needed for display +
 * selection are fetched — never the full DailyActivity row.
 */
export const dailyActivityOptionSchema = z.object({
  DailyActivityId: z.number().int(),
  /** Human-readable label built by the proc: Task (YYYY-MM-DD). */
  Label: z.string(),
});

export type DailyActivityOption = z.infer<typeof dailyActivityOptionSchema>;

/**
 * Returns a lightweight option list for all non-deleted daily activities
 * belonging to the given project, ordered by RequestDate DESC so the most
 * recent tasks appear first in the combobox.
 *
 * Calls usp_DailyActivity_ListOptions — a thin read-only proc that returns
 * only DailyActivityId + Label.  Falls back to an empty array on any error
 * so the sheet still renders; the combobox will simply show no options.
 */
export async function listDailyActivityOptions(
  projectId: number,
  actorUserId: number,
): Promise<DailyActivityOption[]> {
  const rows = await execProc<DailyActivityOption>("usp_DailyActivity_ListOptions", {
    ProjectId: projectId,
    ActorUserId: actorUserId,
  });
  return rows.map((r) => dailyActivityOptionSchema.parse(r));
}
