"use server";

import { action } from "@/lib/action";
import { updateProject } from "../repository/projects";
import { updateProjectFormSchema } from "../schemas/project-form";

/** Update the charter (rowversion CONFLICT surfaces via the error summary). */
export const updateProjectAction = action({
  name: "projects.update",
  schema: updateProjectFormSchema,
  permission: "projects:update",
  revalidate: ["/projects"],
  handler: (input, ctx) => updateProject(input, ctx.session.userId),
});
