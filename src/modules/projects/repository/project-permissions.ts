import { z } from "zod";
import type { PermissionOverride } from "@/lib/auth/rbac";
import { execProc } from "@/lib/db";
import {
  setProjectPermissionsInput,
  type SetProjectPermissionsInput,
} from "../schemas/project-permission";
import { overrideRowSchema, toOverride } from "./project-access";

/**
 * Per-person permission overrides of a project (ADR-0024): stored procedures
 * only, rows zod-parsed at the boundary. Both procs require Manager on the
 * project — the team's cog is for the people who manage the team.
 */

const listRowSchema = overrideRowSchema.extend({ UserId: z.number().int() });

/** Every member's overrides in a project, by user id. */
export async function listProjectPermissions(
  projectId: number,
  actorUserId: number,
): Promise<Record<number, PermissionOverride[]>> {
  const rows = await execProc("usp_ProjectPermission_List", {
    ProjectId: projectId,
    ActorUserId: actorUserId,
  });
  const byUser: Record<number, PermissionOverride[]> = {};
  for (const row of rows.map((r) => listRowSchema.parse(r))) {
    (byUser[row.UserId] ??= []).push(toOverride(row));
  }
  return byUser;
}

/** Replaces one person's overrides; returns them as saved. */
export async function setProjectPermissions(
  input: SetProjectPermissionsInput,
  actorUserId: number,
): Promise<PermissionOverride[]> {
  const parsed = setProjectPermissionsInput.parse(input);
  const rows = await execProc("usp_ProjectPermission_Set", {
    ProjectId: parsed.projectId,
    UserId: parsed.userId,
    OverridesJson: JSON.stringify(parsed.overrides),
    ActorUserId: actorUserId,
  });
  return rows.map((r) => toOverride(listRowSchema.parse(r)));
}
