import { z } from "zod";
import { execProc } from "../db";

/**
 * Example repository — the pattern every module follows:
 * zod-validated inputs, stored-procedure-only data access.
 */
export const activityStatusSchema = z.object({
  ActivityStatusId: z.number().int(),
  Name: z.string().min(1).max(50),
  SortOrder: z.number().int(),
});

export type ActivityStatus = z.infer<typeof activityStatusSchema>;

export const createActivityStatusInput = z.object({
  name: z.string().trim().min(1).max(50),
  sortOrder: z.number().int().min(0).default(0),
});

export async function listActivityStatuses(): Promise<ActivityStatus[]> {
  const rows = await execProc<ActivityStatus>("usp_ActivityStatus_List");
  return rows.map((r) => activityStatusSchema.parse(r));
}

export async function createActivityStatus(
  input: z.infer<typeof createActivityStatusInput>,
  actorUserId: number,
): Promise<number> {
  const parsed = createActivityStatusInput.parse(input);
  const rows = await execProc<{ ActivityStatusId: number }>("usp_ActivityStatus_Create", {
    Name: parsed.name,
    SortOrder: parsed.sortOrder,
    ActorUserId: actorUserId,
  });
  return rows[0].ActivityStatusId;
}
