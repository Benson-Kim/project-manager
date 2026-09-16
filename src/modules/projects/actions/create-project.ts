"use server";

import { action } from "@/lib/action";
import { createProject } from "../repository/projects";
import { projectFormSchema } from "../schemas/project-form";

/** Create a project (RBAC projects:create — Admin + PM; audited in-proc). */
export const createProjectAction = action({
  name: "projects.create",
  schema: projectFormSchema,
  permission: "projects:create",
  revalidate: ["/projects"],
  handler: (input, ctx) => createProject(input, ctx.session.userId),
});
