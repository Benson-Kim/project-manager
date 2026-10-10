import { z } from "zod";
import { execProc } from "@/lib/db";

const userOptionSchema = z.object({
  UserId: z.number().int(),
  DisplayName: z.string(),
});

export type UserOption = z.infer<typeof userOptionSchema>;

/**
 * Active user accounts a project manager can add to a team (ADR-0021):
 * usp_User_ListOptions returns only ids and display names. Linking a team
 * member to an account is what grants them access to the project.
 */
export async function listUserOptions(actorUserId: number): Promise<UserOption[]> {
  const rows = await execProc("usp_User_ListOptions", {
    ActorUserId: actorUserId,
    Search: null,
  });
  return rows.map((r) => userOptionSchema.parse(r));
}
