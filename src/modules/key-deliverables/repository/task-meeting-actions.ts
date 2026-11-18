import { z } from "zod";
import { execProc } from "@/lib/db";

const dateOnly = z
  .union([z.string(), z.date()])
  .nullable()
  .transform((value) =>
    value == null
      ? null
      : typeof value === "string"
        ? value.slice(0, 10)
        : value.toISOString().slice(0, 10),
  );

export const taskMeetingActionSchema = z.object({
  MeetingActionItemId: z.number().int(),
  Action: z.string().nullable(),
  Status: z.string().nullable(),
  DueDate: dateOnly,
  MeetingId: z.number().int(),
  MeetingSubject: z.string().nullable(),
  MeetingDate: dateOnly,
});
export type TaskMeetingAction = z.infer<typeof taskMeetingActionSchema>;

/** The meeting action items that point at one WBS task, newest meeting first. */
export async function listTaskMeetingActions(
  keyDeliverableId: number,
  actorUserId: number,
): Promise<TaskMeetingAction[]> {
  const rows = await execProc("usp_KeyDeliverable_ListMeetingActions", {
    KeyDeliverableId: keyDeliverableId,
    ActorUserId: actorUserId,
  });
  return z.array(taskMeetingActionSchema).parse(rows);
}
