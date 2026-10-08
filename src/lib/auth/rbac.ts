import { ACCESS_LEVELS, type AccessLevel, type Permission, type Role } from "./types";

/**
 * The single permission policy (source: docs/PLAN.md §9, ADR-0021), in two layers.
 *
 * 1. Global role — `can(role, permission)`, the action-layer gate (src/lib/action.ts):
 *    - Admin: everything, plus admin-only modules (#23).
 *    - User: everything except the admin module. Whether a User may touch a
 *      project's records is decided per project by the stored procedures
 *      (dbo.usp_Project_AssertAccess → FORBIDDEN_ROW), never by this gate.
 *
 * 2. Project access level — `canInProject(level, permission)`, what the UI offers
 *    in one project, or for project-less records (level from getProjectAccess):
 *    - Viewer: read only.
 *    - Contributor: read; create/update on operational modules; no deletes.
 *    - Manager: everything in the project, including deletes and the team.
 *    Each proc passes the same level as @MinLevel; src/tests/proc-access-levels.test.ts checks db/procs
 *    against requiredLevel() so the two cannot drift.
 *
 * Module sessions register operational modules here (append-only; keep sorted).
 */
export const CONTRIBUTOR_WRITE_MODULES = [
  "assumptions-constraints",
  "daily-activities",
  "meetings",
  "notes",
  "parking-lot",
  "questions-answers",
  "todo-alerts",
  "todo-items",
] as const;

function parse(permission: Permission): [module: string, verb: string] | null {
  const [module, verb] = permission.split(":") as [string, string];
  return module && verb ? [module, verb] : null;
}

/** Action-layer gate on the global role. */
export function can(role: Role, permission: Permission): boolean {
  const parsed = parse(permission);
  if (!parsed) return false;

  switch (role) {
    case "Admin":
      return true;
    case "User":
      return parsed[0] !== "admin";
    default:
      return false;
  }
}

/** The lowest project access level a permission needs; null when no project level grants it. */
export function requiredLevel(permission: Permission): AccessLevel | null {
  const parsed = parse(permission);
  if (!parsed) return null;
  const [module, verb] = parsed;
  if (module === "admin") return null;
  if (verb === "read") return "Viewer";
  if (verb === "delete") return "Manager";
  return (CONTRIBUTOR_WRITE_MODULES as readonly string[]).includes(module)
    ? "Contributor"
    : "Manager";
}

/** Whether an access level (null = no access) allows a permission in a project. */
export function canInProject(level: AccessLevel | null, permission: Permission): boolean {
  const needed = requiredLevel(permission);
  if (!level || !needed) return false;
  return ACCESS_LEVELS.indexOf(level) >= ACCESS_LEVELS.indexOf(needed);
}
