"use server";

import { action } from "@/lib/action";
import { deleteProject } from "../repository/projects";
import { deleteProjectInput } from "../schemas/project";

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
