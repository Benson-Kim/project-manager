import { z } from "zod";
import { execProc } from "../db";

const rowSchema = z.object({
  DueSoonDays: z.number().int(),
  IdleTimeoutMinutes: z.number().int(),
});

/** The signed-in user's own settings (migrations 059, 060); the defaults when never saved. */
export interface UserPreference {
  /** A to-do due within this many days counts as "Due soon". */
  dueSoonDays: number;
  /** Idle minutes before the user is signed out; 0 = Never. */
  idleTimeoutMinutes: number;
}

export async function getUserPreference(userId: number): Promise<UserPreference> {
  const rows = await execProc("usp_UserPreference_Get", { ActorUserId: userId });
  const row = rowSchema.parse(rows[0]);
  return { dueSoonDays: row.DueSoonDays, idleTimeoutMinutes: row.IdleTimeoutMinutes };
}

export async function setDueSoonDays(userId: number, dueSoonDays: number): Promise<void> {
  await execProc("usp_UserPreference_SetDueSoonDays", {
    ActorUserId: userId,
    DueSoonDays: dueSoonDays,
  });
}

export async function setIdleTimeout(userId: number, idleTimeoutMinutes: number): Promise<void> {
  await execProc("usp_UserPreference_SetIdleTimeout", {
    ActorUserId: userId,
    IdleTimeoutMinutes: idleTimeoutMinutes,
  });
}
