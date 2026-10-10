import { readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { describe, expect, it } from "vitest";
import { OVERRIDABLE_MODULES, requiredLevel } from "@/lib/auth/rbac";

/**
 * Guardrail (ADR-0021): the stored procedures enforce per-project access with a
 * literal @MinLevel, and the UI decides which buttons to show with
 * requiredLevel() in src/lib/auth/rbac.ts. This test reads db/procs and fails
 * when the two disagree, or when a project-scoped proc stops checking access.
 */

/** Proc folder -> permission module (rbac.ts names). */
const MODULES: Record<string, string> = {
  "daily-activity": "daily-activities",
  "key-deliverable": "key-deliverables",
  keyword: "keywords",
  objective: "objectives",
  "question-answer": "questions-answers",
  stakeholder: "stakeholders",
  supplier: "suppliers",
  "parking-lot-item": "parking-lot",
  "assumption-constraint": "assumptions-constraints",
  "todo-item": "todo-items",
  "todo-alert": "todo-alerts",
  project: "projects",
  "project-assignee": "projects",
};

/** Proc name suffix -> permission verb. */
const VERBS: Record<string, string> = {
  GetById: "read",
  List: "read",
  ListOptions: "read",
  GanttData: "read",
  Create: "create",
  BuildFromDailyActivity: "create",
  Update: "update",
  Reorder: "update",
  Dismiss: "update",
  Snooze: "update",
  Set: "update",
  Delete: "delete",
};

/** Procs that legitimately call no access helper, and why. */
const EXEMPT: Record<string, string> = {
  usp_Project_Create: "any user may create a project; the creator becomes its Manager",
  usp_Project_List: "filters to Admin-or-assigned projects instead of asserting one",
  usp_Project_Search: "filters to Admin-or-assigned projects instead of asserting one",
  usp_Todo_GetDueAlerts:
    "returns the actor's alerts and own to-dos, filtered by the to-do rule (ufn_TodoItem_AccessLevel)",
  usp_Todo_GetUpcomingAlerts: "returns only the actor's own to-dos (CreatedBy)",
};

/** The access helpers themselves (they take @MinLevel as a parameter). */
const HELPER = /_(AssertAccess|ResolveAccess|GetAccess)$/;

const ASSERT_CALL = /EXEC\s+dbo\.(usp_(\w+?)_AssertAccess)\b[\s\S]*?@MinLevel\s*=\s*N'(\w+)'/g;

interface Proc {
  folder: string;
  name: string;
  source: string;
}

const procs: Proc[] = Object.keys(MODULES).flatMap((folder) =>
  readdirSync(join("db", "procs", folder))
    // Procs only: inline functions (ufn_*) hold the access rule itself (ADR-0023) and are
    // called by the helpers and list procs checked here.
    .filter((f) => f.startsWith("usp_") && f.endsWith(".sql"))
    .map((f) => ({
      folder,
      name: basename(f, ".sql"),
      source: readFileSync(join("db", "procs", folder, f), "utf8"),
    }))
    .filter((p) => !HELPER.test(p.name)),
);

/** The entity a folder's own helper checks, e.g. "todo-item" -> "TodoItem". */
const entityOf = (folder: string) =>
  folder.replace(/(^|-)(\w)/g, (_, __, c: string) => c.toUpperCase());

const verbOf = (name: string) => {
  const suffix = Object.keys(VERBS).find((s) => name.endsWith(`_${s}`));
  return suffix && VERBS[suffix];
};

/**
 * The levels a proc demands for its own operation. In a write, a Viewer check
 * through another entity's helper only confirms the actor may read a linked
 * record (e.g. a to-do's daily activity), so it is not the operation's level.
 */
function operationLevels(proc: Proc): string[] {
  const isWrite = verbOf(proc.name) !== "read";
  return [...proc.source.matchAll(ASSERT_CALL)]
    .filter(([, , entity, level]) => {
      const linkedRead =
        isWrite && level === "Viewer" && entity !== "Project" && entity !== entityOf(proc.folder);
      return !linkedRead;
    })
    .map(([, , , level]) => level);
}

describe("stored procedure access levels match rbac.ts (ADR-0021)", () => {
  it("finds the project-scoped procs", () => {
    expect(procs.length).toBeGreaterThan(50);
  });

  it.each(procs.map((p) => [p.name, p] as const))(
    "%s checks access or is exempt for a stated reason",
    (name, proc) => {
      if (name in EXEMPT) {
        expect(proc.source).not.toMatch(ASSERT_CALL);
        return;
      }
      expect(operationLevels(proc), `${name} must call an AssertAccess helper`).not.toHaveLength(0);
    },
  );

  it.each(procs.filter((p) => !(p.name in EXEMPT)).map((p) => [p.name, p] as const))(
    "%s demands the level requiredLevel() gives the UI",
    (name, proc) => {
      const verb = verbOf(name);
      expect(verb, `${name}: map its verb in VERBS`).toBeDefined();
      const expected = requiredLevel(`${MODULES[proc.folder]}:${verb}`);
      for (const level of operationLevels(proc)) expect(level, name).toBe(expected);
    },
  );
});

/** A whole access-helper call, up to its semicolon. */
const WHOLE_CALL = /EXEC\s+dbo\.usp_\w+?_AssertAccess\b[^;]*;/g;
const writeChecks = (proc: Proc) =>
  [...proc.source.matchAll(WHOLE_CALL)]
    .map(([call]) => call)
    .filter((call) => /@MinLevel\s*=\s*N'(Contributor|Manager)'/.test(call));

describe("write checks name their permission for per-person overrides (ADR-0024)", () => {
  const writes = procs.filter((p) => !(p.name in EXEMPT) && verbOf(p.name) !== "read");

  it.each(
    writes
      .filter((p) => (OVERRIDABLE_MODULES as readonly string[]).includes(MODULES[p.folder]!))
      .map((p) => [p.name, p] as const),
  )("%s passes exactly its own permission on every write-level check", (name, proc) => {
    const permission = `${MODULES[proc.folder]}:${verbOf(name)}`;
    const checks = writeChecks(proc);
    expect(checks, name).not.toHaveLength(0);
    for (const call of checks) expect(call, name).toContain(`@Permission = N'${permission}'`);
  });

  it.each(
    writes
      .filter((p) => !(OVERRIDABLE_MODULES as readonly string[]).includes(MODULES[p.folder]!))
      .map((p) => [p.name, p] as const),
  )("%s (charter / team) never lets an override decide", (name, proc) => {
    for (const call of writeChecks(proc)) expect(call, name).not.toContain("@Permission");
  });

  it("the override set proc accepts exactly the overridable sections", () => {
    const setProc = readFileSync(
      join("db", "procs", "project-permission", "usp_ProjectPermission_Set.sql"),
      "utf8",
    );
    const listed = setProc.match(/\[Module\] NOT IN \(([^)]*)\)/)?.[1] ?? "";
    const modules = [...listed.matchAll(/N'([a-z-]+)'/g)].map((m) => m[1]);
    expect(modules.sort()).toEqual([...OVERRIDABLE_MODULES].sort());
  });
});
