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
  board: "boards",
  "board-column": "boards",
  "board-card": "boards",
  "board-phase": "boards",
  "board-sprint": "boards",
  "daily-activity": "daily-activities",
  "key-deliverable": "key-deliverables",
  "key-deliverable-dependency": "key-deliverables",
  keyword: "keywords",
  objective: "objectives",
  requirement: "requirements",
  "question-answer": "questions-answers",
  "risk-issue": "risks-issues",
  stakeholder: "stakeholders",
  supplier: "suppliers",
  "parking-lot-item": "parking-lot",
  note: "notes",
  "note-tab": "notes",
  "assumption-constraint": "assumptions-constraints",
  "todo-item": "todo-items",
  "todo-alert": "todo-alerts",
  financial: "financials",
  "financial-line": "financials",
  "financial-document": "financials",
  "financial-transaction": "financial-tax-invoices",
  "financial-tax-profile": "financial-tax-invoices",
  project: "projects",
  "project-assignee": "projects",
  meeting: "meetings",
  "meeting-agenda-item": "meetings",
  "meeting-discussion-point": "meetings",
  "meeting-action-item": "meetings",
  "meeting-action-followup": "meetings",
  "meeting-participant": "meetings",
};

/** Proc name suffix -> permission verb. */
const VERBS: Record<string, string> = {
  GetById: "read",
  List: "read",
  ListOptions: "read",
  ListPackagingOptions: "read",
  GanttData: "read",
  // Meetings (ADR-0028): the workspace, the participant panel and the printed minutes' lists.
  GetWorkspace: "read",
  GetParticipants: "read",
  GetRoster: "read",
  GetAttendees: "read",
  GetApologies: "read",
  // Financials calculator (ADR-0029).
  GetSheet: "read",
  GetWithTabs: "read",
  // Boards (ADR-0038): the whole board in five sets, and the card sheet's assignee picker.
  GetBoard: "read",
  ListAssignees: "read",
  Create: "create",
  // Packaging adds board cards, with read access to each source requirement project.
  Package: "create",
  // Copying a template's documents into a financial adds rows (ADR-0030).
  CreateFromTemplate: "create",
  BuildFromDailyActivity: "create",
  Update: "update",
  Reorder: "update",
  // Work breakdown (ADR-0027): placing, dating and naming an item edit it.
  Move: "update",
  Reschedule: "update",
  Rename: "update",
  // Requirements (ADR-0037): taking a requirement off one deliverable is an update of it.
  Unallocate: "update",
  // Boards (ADR-0038): running a sprint is editing the board's work, not administering it, so
  // both lifecycle steps are Contributor verbs — the same level as moving a card.
  Start: "update",
  Complete: "update",
  // Status picked from the WBS or Gantt menu (ADR-0036).
  SetStatus: "update",
  // Turning an item into a milestone, or back into a task, edits it (ADR-0046).
  SetMilestone: "update",
  // Sequencing two items, retyping the link or taking it away all edit the plan, never the
  // deliverables themselves, so all three are an update (ADR-0046).
  Link: "update",
  Relink: "update",
  Unlink: "update",
  Dismiss: "update",
  Snooze: "update",
  Set: "update",
  Delete: "delete",
  // Attachments (ADR-0026): reading them is reading the record; adding, renaming or removing one
  // edits it, so even RemoveFile is the owner's update (user decision 2026-10-10).
  ListFiles: "read",
  GetFile: "read",
  CanAddFile: "update",
  AddFile: "update",
  RenameFile: "update",
  RemoveFile: "update",
};

/** Procs that legitimately call no access helper, and why. */
const EXEMPT: Record<string, string> = {
  usp_Project_Create: "any user may create a project; the creator becomes its Manager",
  usp_Project_List: "filters to Admin-or-assigned projects instead of asserting one",
  usp_Project_Search: "filters to Admin-or-assigned projects instead of asserting one",
  usp_Todo_GetDueAlerts:
    "returns the actor's alerts and own to-dos, filtered by the to-do rule (ufn_TodoItem_AccessLevel)",
  usp_Todo_GetUpcomingAlerts: "returns only the actor's own to-dos (CreatedBy)",
  usp_KeyDeliverable_AssertPlacement:
    "checks a parent inside the write procs' transaction, after their own access check",
  usp_Financial_AssertLabelList: "checks a JSON list of labels; no data access",
  usp_FinancialDocument_AssertSuggestions: "checks a JSON list of suggestion rules; no data access",
  usp_FinancialLine_SetAmounts:
    "replaces a line's amounts inside the line write procs' transaction, after their own access check",
  usp_KeyDeliverable_RollUp:
    "recomputes parent dates inside the write procs' transaction, after their own access check",
  usp_KeyDeliverable_CascadeDependencies:
    "pushes dependent items inside the write procs' transaction, after their own access check",
  usp_Requirement_ReplaceTraces:
    "replaces links inside the requirement write procs' transaction, after their own access check",
  usp_Requirement_ReplaceAllocations:
    "replaces allocations inside the requirement write procs' transaction, after their own access check",
  usp_Board_AssertRoom:
    "checks a column's work-in-progress limit inside the card write procs' transaction, after their own access check; it refuses to run outside one",
  usp_BoardCard_AssertAssignee:
    "checks an assignee against the board's project inside the card write procs' transaction, after their own access check; it refuses to run outside one",
};

/**
 * Procs that cross two scopes and so ask two different questions, with a
 * different level and permission on each. The one-level rule below cannot read
 * them, so each entry lists every call the proc must make, in order, and the
 * last block in this file asserts that set exactly — a call added, dropped or
 * re-levelled fails there rather than quietly widening what the proc accepts.
 * This registry is the stricter replacement for the generic rule, not an escape
 * from it: a proc listed here is checked against this table and against
 * requiredLevel(), which is more than the generic blocks ask of anything else.
 */
const CROSS_SCOPE: Record<
  string,
  { entity: string; level: string; permission: `${string}:${string}` }[]
> = {
  usp_BoardCard_Package: [
    { entity: "Board", level: "Contributor", permission: "boards:create" },
    { entity: "Project", level: "Viewer", permission: "requirements:read" },
  ],
  usp_Board_SetProject: [
    // Taking a board out of a project removes it from everyone who reached it there.
    { entity: "Board", level: "Manager", permission: "boards:delete" },
    // Landing it in one is creating a board there, so it asks what usp_Board_Create asks.
    { entity: "Project", level: "Contributor", permission: "boards:create" },
  ],
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

  it.each(
    procs
      .filter((p) => !(p.name in EXEMPT) && !(p.name in CROSS_SCOPE))
      .map((p) => [p.name, p] as const),
  )("%s demands the level requiredLevel() gives the UI", (name, proc) => {
    const verb = verbOf(name);
    expect(verb, `${name}: map its verb in VERBS`).toBeDefined();
    const expected = requiredLevel(`${MODULES[proc.folder]}:${verb}`);
    for (const level of operationLevels(proc)) expect(level, name).toBe(expected);
  });
});

/** A whole access-helper call, up to its semicolon. */
const WHOLE_CALL = /EXEC\s+dbo\.usp_\w+?_AssertAccess\b[^;]*;/g;
const writeChecks = (proc: Proc) =>
  [...proc.source.matchAll(WHOLE_CALL)]
    .map(([call]) => call)
    .filter((call) => /@MinLevel\s*=\s*N'(Contributor|Manager)'/.test(call));

describe("write checks name their permission for per-person overrides (ADR-0024)", () => {
  const writes = procs.filter(
    (p) => !(p.name in EXEMPT) && !(p.name in CROSS_SCOPE) && verbOf(p.name) !== "read",
  );

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

describe("a cross-scope proc asks every scope it crosses (ADR-0038 decision 23)", () => {
  it.each(Object.entries(CROSS_SCOPE))("%s makes exactly its registered checks", (name, wanted) => {
    const proc = procs.find((p) => p.name === name);
    expect(proc, `${name}: no such proc under db/procs`).toBeDefined();

    const calls = [...proc!.source.matchAll(WHOLE_CALL)].map(([call]) => call);
    expect(calls, `${name}: one call per registered scope, in order`).toHaveLength(wanted.length);

    wanted.forEach((want, i) => {
      const call = calls[i]!;
      expect(call, `${name} call ${i + 1}`).toContain(`dbo.usp_${want.entity}_AssertAccess`);
      expect(call, `${name} call ${i + 1}`).toContain(`@MinLevel = N'${want.level}'`);
      expect(call, `${name} call ${i + 1}`).toContain(`@Permission = N'${want.permission}'`);
      // The level the UI computes for that permission, so proc and cog cannot drift apart.
      expect(requiredLevel(want.permission), `${name}: ${want.permission}`).toBe(want.level);
      // Packaging also reads the source register; every other check stays in its own module.
      expect(want.permission.split(":")[0], `${name}: ${want.permission}`).toBe(
        name === "usp_BoardCard_Package" && i === 1 ? "requirements" : MODULES[proc!.folder],
      );
    });
  });

  it("registers every proc whose checks disagree with each other", () => {
    // The generic rule reads one level per proc. Any proc that asks two different levels must be
    // registered above, or it would pass that rule by accident on whichever call it reads first.
    const disagreeing = procs
      .filter((p) => !(p.name in EXEMPT))
      .filter((p) => new Set(operationLevels(p)).size > 1)
      .map((p) => p.name);
    expect(disagreeing.sort()).toEqual(Object.keys(CROSS_SCOPE).sort());
  });
});
