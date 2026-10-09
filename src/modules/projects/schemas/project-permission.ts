import { z } from "zod";
import { OVERRIDABLE_MODULES, OVERRIDE_VERBS } from "@/lib/auth/rbac";

/**
 * One person's permission overrides in one project (ADR-0024), as the team's
 * cog saves them: only the differences from their access level. The proc
 * (dbo.usp_ProjectPermission_Set) checks the same rules and who may save.
 */
export const permissionOverrideInput = z.object({
  module: z.enum(OVERRIDABLE_MODULES),
  verb: z.enum(OVERRIDE_VERBS),
  allowed: z.boolean(),
});

export const setProjectPermissionsInput = z
  .object({
    projectId: z.coerce.number().int().positive(),
    userId: z.coerce.number().int().positive(),
    overrides: z
      .array(permissionOverrideInput)
      .max(OVERRIDABLE_MODULES.length * OVERRIDE_VERBS.length),
  })
  .refine(
    (input) =>
      new Set(input.overrides.map((o) => `${o.module}:${o.verb}`)).size === input.overrides.length,
    { path: ["overrides"], message: "Each section and action can be set only once" },
  );

export type SetProjectPermissionsInput = z.input<typeof setProjectPermissionsInput>;
