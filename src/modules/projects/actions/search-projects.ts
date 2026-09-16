"use server";

import { z } from "zod";
import { action } from "@/lib/action";
import { searchProjects } from "../repository/projects";

/** Type-ahead search (req 0.2 — matches from the first character). */
export const searchProjectsAction = action({
  name: "projects.search",
  schema: z.object({ prefix: z.string().trim().min(1).max(100) }),
  permission: "projects:read",
  handler: (input, ctx) => searchProjects(input.prefix, ctx.session.userId),
});
