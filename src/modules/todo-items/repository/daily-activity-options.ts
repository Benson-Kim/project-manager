import { execProc } from "@/lib/db";
import { z } from "zod";

/**
 * Lightweight daily-activity options helper (ISP boundary): the
 * todo-items module depends on this file — NOT on the full daily-activities
 * module — to populate the linked-activity combobox in the TodoItemSheet.
 *
 * Returns a stable {value, label} shape for use with the Combobox component.
 */

export const dailyActivityOptionSchema = z.object({
  DailyActivityId: z.number().int(),
  Task: z.string().nullable(),
});

export type DailyActivityOption = z.infer<typeof dailyActivityOptionSchema>;

/**
 * Fetches up to 200 active activities for the combobox — enough for any real
 * project. Uses usp_DailyActivity_List; all other params default to no-filter,
 * page 1, size 200.
 */
export async function listDailyActivityOptions(
  projectId: number,
  actorUserId: number,
): Promise<DailyActivityOption[]> {
  const rows = await execProc<DailyActivityOption>("usp_DailyActivity_List", {
    ActorUserId: actorUserId,
    ProjectId: projectId,
    Search: null,
    SortBy: "RequestDate",
    SortDir: "desc",
    Page: 1,
    PageSize: 200,
  });
  return rows.map((r) => dailyActivityOptionSchema.parse(r));
}
