import type { Permission, Role } from "./types";

/**
 * The single role→permission matrix (source: docs/PLAN.md §9). Row-level
 * checks live in stored procedures  FORBIDDEN_ROW) — this matrix is
 * the action-layer gate only.
 *
 * Semantics:
 * - Admin: everything, plus admin-only modules (#23).
 * - ProjectManager: full read/write across domain modules.
 * - Contributor: read everything; create/update on operational modules
 *   (activities, to-dos, meetings, notes, parking lot, Q&A); no deletes.
 * - Viewer: read only.
 *
 * Module sessions register their verbs here (append-only; keep sorted).
 */
const CONTRIBUTOR_WRITE_MODULES = [
  "daily-activities",
  "meetings",
  "notes",
  "parking-lot",
  "questions-answers",
  "todo-alerts",
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
      return (CONTRIBUTOR_WRITE_MODULES as readonly string[]).includes(module);
    case "Viewer":
      return verb === "read" && module !== "admin";
    default:
      return false;
  }
}
