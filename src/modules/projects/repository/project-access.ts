import { cache } from "react";
import { z } from "zod";
import {
  allowsWithOverrides,
  OVERRIDABLE_MODULES,
  OVERRIDE_VERBS,
  type PermissionOverride,
} from "@/lib/auth/rbac";
import { ACCESS_LEVELS, type AccessLevel, type Permission } from "@/lib/auth/types";
import { execProc } from "@/lib/db";

/** One override as the procs return it (usp_Project_GetAccess JSON, usp_ProjectPermission_*). */
export const overrideRowSchema = z.object({
  Module: z.enum(OVERRIDABLE_MODULES),
  Verb: z.enum(OVERRIDE_VERBS),
  Allowed: z.coerce.boolean(),
});

export const toOverride = (row: z.infer<typeof overrideRowSchema>): PermissionOverride => ({
  module: row.Module,
  verb: row.Verb,
  allowed: row.Allowed,
});

const accessRowSchema = z.object({
  AccessLevel: z.enum(ACCESS_LEVELS).nullable(),
  OverridesJson: z.string().nullable().optional(),
});

/** The actor's standing in a project: their level and their per-person overrides (ADR-0024). */
export interface ProjectAccess {
  level: AccessLevel | null;
  overrides: PermissionOverride[];
}

/**
 * The actor's access in a project, or for project-less records when
 * `projectId` is null (ADR-0021): Admins hold Manager everywhere (and never
 * overrides); null means no access. Only for showing or hiding actions: every
 * proc enforces the same rule itself (dbo.usp_Project_AssertAccess). Request-
 * cached, so a layout and its page share one call.
 */
export const getProjectAccessInfo = cache(
  async (projectId: number | null, actorUserId: number): Promise<ProjectAccess> => {
    const rows = await execProc("usp_Project_GetAccess", {
      ProjectId: projectId,
      ActorUserId: actorUserId,
    });
    const row = accessRowSchema.parse(rows[0]);
    const overrides = row.OverridesJson
      ? z.array(overrideRowSchema).parse(JSON.parse(row.OverridesJson)).map(toOverride)
      : [];
    return { level: row.AccessLevel, overrides };
  },
);

/** The actor's access level in a project (see getProjectAccessInfo). */
export async function getProjectAccess(
  projectId: number | null,
  actorUserId: number,
): Promise<AccessLevel | null> {
  return (await getProjectAccessInfo(projectId, actorUserId)).level;
}

/** What a page may offer in one project (or for project-less records when null). */
export type ProjectPermissions = (permission: Permission) => boolean;

/** A permission check bound to the actor's level and overrides in one project. */
export async function getProjectPermissions(
  projectId: number | null,
  actorUserId: number,
): Promise<ProjectPermissions> {
  const { level, overrides } = await getProjectAccessInfo(projectId, actorUserId);
  return (permission) => allowsWithOverrides(level, overrides, permission);
}
