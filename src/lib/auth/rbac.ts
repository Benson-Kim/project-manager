import type { Permission, Role } from "./types";

/**
 * The single role→permission matrix (source: docs/PLAN.md §9). Row-level
 * checks live in stored procedures (ADR-0012 FORBIDDEN_ROW) — this matrix is
 * the action-layer gate only.
 *
 * Semantics:
 * - Admin: everything, plus admin-only modules (#23).
 * - ProjectManager: full read/write across domain modules.
 * - Contributor: read everything; create/update on operational modules
 *   (activities, to-dos, meetings, notes, parking lot); update-only on Q&A;
 *   no deletes.
 * - Viewer: read only.
 *
 * Module sessions register their verbs here (append-only; keep sorted).
 */
const CONTRIBUTOR_WRITE_MODULES = [
  "daily-activities",
  "meetings",
  "notes",
  "parking-lot",
  "todo-alerts",
  "todo-items",
] as const;

/**
 * Modules where Contributors may update existing records but NOT create new ones.
 * Pattern: Admin + PM own the entity lifecycle; Contributors can enrich records.
 */
const CONTRIBUTOR_UPDATE_ONLY_MODULES = [
  "questions-answers",
] as const;

export function can(role: Role, permission: Permission): boolean {
  const [module, verb] = permission.split(":") as [string, string];
  if (!module || !verb) return false;

  switch (role) {
    case "Admin":
      return true;
    case "ProjectManager":
      // Everything except the admin module.
      return module !== "admin";
    case "Contributor":
      if (verb === "read") return module !== "admin";
      if (verb === "delete") return false;
      if (verb === "update")
        return (
          (CONTRIBUTOR_WRITE_MODULES as readonly string[]).includes(module) ||
          (CONTRIBUTOR_UPDATE_ONLY_MODULES as readonly string[]).includes(module)
        );
      // create and other write verbs: CONTRIBUTOR_WRITE_MODULES only.
      return (CONTRIBUTOR_WRITE_MODULES as readonly string[]).includes(module);
    case "Viewer":
      return verb === "read" && module !== "admin";
    default:
      return false;
  }
}
