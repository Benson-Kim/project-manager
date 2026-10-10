"use server";

import { z } from "zod";

import { action } from "@/lib/action";
import {
  createProject,
  deleteProject,
  searchProjects,
  updateProject,
} from "../repository/projects";
import { projectFormSchema, updateProjectFormSchema } from "../schemas/project-form";
import { deleteProjectInput, setProjectAssigneesInput } from "../schemas/project";
import { setProjectAssignees } from "../repository/project-assignees";
import { setProjectPermissions } from "../repository/project-permissions";
import { setProjectPermissionsInput } from "../schemas/project-permission";

/** Create a project (RBAC projects:create — project level checked in-proc, ADR-0021). */
export const createProjectAction = action({
  name: "projects.create",
  schema: projectFormSchema,
  permission: "projects:create",
  revalidate: ["/projects"],
  handler: (input, ctx) => createProject(input, ctx.session.userId),
});

/** Type-ahead search (matches from the first character). */
export const searchProjectsAction = action({
  name: "projects.search",
  schema: z.object({ prefix: z.string().trim().min(1).max(100) }),
  permission: "projects:read",
  handler: (input, ctx) => searchProjects(input.prefix, ctx.session.userId),
});

/** Update the charter (rowversion CONFLICT surfaces via the error summary). */
export const updateProjectAction = action({
  name: "projects.update",
  schema: updateProjectFormSchema,
  permission: "projects:update",
  revalidate: ["/projects"],
  handler: (input, ctx) => updateProject(input, ctx.session.userId),
});

/** Soft-delete a project (ConfirmDialog names the project before this runs). */
export const deleteProjectAction = action({
  name: "projects.delete",
  schema: deleteProjectInput,
  permission: "projects:delete",
  revalidate: ["/projects"],
  handler: async (input, ctx) => {
    await deleteProject(input.projectId, input.rowVer, ctx.session.userId);
    return { projectId: input.projectId };
  },
});

/**
 * Replace the full assignee set of a project
 * The client submits the whole set as a JSON payload (plain object input).
 */
export const setProjectAssigneesAction = action({
  name: "projects.setAssignees",
  schema: setProjectAssigneesInput,
  permission: "projects:update",
  revalidate: ["/projects"],
  handler: (input, ctx) => setProjectAssignees(input, ctx.session.userId),
});

/**
 * Replace one team member's permission overrides (ADR-0024, the team's cog).
 * The proc requires Manager on the project and refuses a non-Admin's own
 * overrides; audited in-proc.
 */
export const setProjectPermissionsAction = action({
  name: "projects.setPermissions",
  schema: setProjectPermissionsInput,
  permission: "projects:update",
  handler: (input, ctx) => setProjectPermissions(input, ctx.session.userId),
});
