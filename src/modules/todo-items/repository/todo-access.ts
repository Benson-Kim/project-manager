import { canInProject } from "@/lib/auth/rbac";
import {
  getProjectPermissions,
  type ProjectPermissions,
} from "@/modules/projects/repository/project-access";
import type { TodoItemRow } from "../schemas/todo-item";

/**
 * What a page may offer on a to-do (mirrors dbo.usp_TodoItem_AssertAccess, ADR-0021).
 * To-dos are personal outside projects: a project-less to-do the actor could open
 * is their own (or they are an Admin), so they manage it. A to-do in a project
 * follows the actor's level there; with no to-do (a new one), the project-less
 * level applies. Pass only a to-do returned by getTodoItemById for this actor.
 */
export async function getTodoPermissions(
  todo: Pick<TodoItemRow, "ProjectId"> | null,
  actorUserId: number,
): Promise<ProjectPermissions> {
  if (todo && todo.ProjectId === null) return (permission) => canInProject("Manager", permission);
  return getProjectPermissions(todo?.ProjectId ?? null, actorUserId);
}
