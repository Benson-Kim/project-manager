import { cache } from "react";
import { z } from "zod";
import { canInProject } from "@/lib/auth/rbac";
import { ACCESS_LEVELS, type AccessLevel, type Permission } from "@/lib/auth/types";
import { execProc } from "@/lib/db";

const accessRowSchema = z.object({ AccessLevel: z.enum(ACCESS_LEVELS).nullable() });

/**
 * The actor's access level in a project, or for project-less records when
 * `projectId` is null (ADR-0021): Admins hold Manager everywhere; null means no
 * access. Only for showing or hiding actions: every proc enforces the same rule
 * itself (dbo.usp_Project_AssertAccess). Request-cached, so a layout and its page
 * share one call.
 */
export const getProjectAccess = cache(
  async (projectId: number | null, actorUserId: number): Promise<AccessLevel | null> => {
    const rows = await execProc("usp_Project_GetAccess", {
      ProjectId: projectId,
      ActorUserId: actorUserId,
    });
    return accessRowSchema.parse(rows[0]).AccessLevel;
  },
);

/** What a page may offer in one project (or for project-less records when null). */
export type ProjectPermissions = (permission: Permission) => boolean;

/** A permission check bound to the actor's level in one project (getProjectAccess). */
export async function getProjectPermissions(
  projectId: number | null,
  actorUserId: number,
): Promise<ProjectPermissions> {
  const level = await getProjectAccess(projectId, actorUserId);
  return (permission) => canInProject(level, permission);
}
