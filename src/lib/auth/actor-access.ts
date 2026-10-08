import { z } from "zod";
import { canInProject } from "./rbac";
import { ACCESS_LEVELS, type AccessLevel, type Permission } from "./types";

/**
 * The actor's access level on each listed row (ADR-0023): every DataView list
 * proc returns it as `ActorAccess`, resolved by the same rule the procs enforce
 * (dbo.ufn_AccessLevel_Resolve / ufn_TodoItem_AccessLevel). NULL never reaches
 * a list — rows without a level are filtered out — but the type stays honest.
 */
export const actorAccessSchema = z.enum(ACCESS_LEVELS).nullable();

/**
 * The datasheet's row gate: whether the row's ActorAccess allows `permission`
 * (e.g. "key-deliverables:update"). Same table as the page buttons
 * (canInProject), so a cross-project grid edits exactly the rows the procs accept.
 */
export function rowAllows(permission: Permission) {
  return (row: { ActorAccess: AccessLevel | null }) => canInProject(row.ActorAccess, permission);
}
