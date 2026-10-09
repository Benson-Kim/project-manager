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

/** A comma list of verbs (ufn_Permission_Overrides), or null. */
const verbList = z.string().nullable().optional();

/**
 * The access columns of a section list row: the level plus the actor's
 * per-person overrides of that section in the row's project (ADR-0024,
 * `ActorGrants` / `ActorRevokes`, e.g. "create,delete"). Spread into a list
 * row schema; lists that predate overrides simply leave them out.
 */
export const actorAccessFields = {
  ActorAccess: actorAccessSchema,
  ActorGrants: verbList,
  ActorRevokes: verbList,
};

interface AccessRow {
  ActorAccess: AccessLevel | null;
  ActorGrants?: string | null;
  ActorRevokes?: string | null;
}

const has = (list: string | null | undefined, verb: string) =>
  Boolean(list) && list!.split(",").includes(verb);

/**
 * The datasheet's row gate: whether the row allows `permission` (e.g.
 * "key-deliverables:update"). A member's override of that verb decides first
 * (revoked → no, granted → yes), else the level does — the same rule as the
 * procs (dbo.usp_Permission_Require), so a cross-project grid edits exactly the
 * rows the procs accept.
 */
export function rowAllows(permission: Permission) {
  const verb = permission.split(":")[1] ?? "";
  return (row: AccessRow) => {
    if (row.ActorAccess && has(row.ActorRevokes, verb)) return false;
    if (row.ActorAccess && has(row.ActorGrants, verb)) return true;
    return canInProject(row.ActorAccess, permission);
  };
}
