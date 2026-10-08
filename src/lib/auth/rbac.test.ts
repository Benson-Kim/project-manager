import { describe, expect, it } from "vitest";
import { ACCESS_LEVELS } from "./types";
import { can, canInProject, CONTRIBUTOR_WRITE_MODULES, requiredLevel } from "./rbac";

describe("global role gate (ADR-0021, PLAN §9)", () => {
  it("Admin can do everything including the admin module", () => {
    expect(can("Admin", "suppliers:delete")).toBe(true);
    expect(can("Admin", "admin:update")).toBe(true);
  });

  it("User passes every domain gate; the project level decides in-proc", () => {
    expect(can("User", "projects:create")).toBe(true);
    expect(can("User", "suppliers:delete")).toBe(true);
    expect(can("User", "todo-alerts:update")).toBe(true);
  });

  it("User never reaches the admin module", () => {
    expect(can("User", "admin:read")).toBe(false);
    expect(can("User", "admin:update")).toBe(false);
  });

  it("rejects malformed permissions and unknown roles", () => {
    expect(can("Admin", "projects" as `${string}:${string}`)).toBe(false);
    // A token minted before ADR-0021 could carry a retired role.
    expect(can("ProjectManager" as never, "projects:read")).toBe(false);
  });
});

describe("required project access level", () => {
  it("reads need Viewer", () => {
    expect(requiredLevel("projects:read")).toBe("Viewer");
    expect(requiredLevel("todo-items:read")).toBe("Viewer");
  });

  it("deletes need Manager in every module", () => {
    expect(requiredLevel("daily-activities:delete")).toBe("Manager");
    expect(requiredLevel("suppliers:delete")).toBe("Manager");
  });

  it.each(CONTRIBUTOR_WRITE_MODULES)(
    "operational module %s: Contributor creates and updates",
    (module) => {
      expect(requiredLevel(`${module}:create`)).toBe("Contributor");
      expect(requiredLevel(`${module}:update`)).toBe("Contributor");
    },
  );

  it.each(["projects", "key-deliverables", "keywords", "objectives", "stakeholders", "suppliers"])(
    "planning module %s: Manager creates and updates",
    (module) => {
      expect(requiredLevel(`${module}:create`)).toBe("Manager");
      expect(requiredLevel(`${module}:update`)).toBe("Manager");
    },
  );

  it("no project level grants the admin module or a malformed permission", () => {
    expect(requiredLevel("admin:read")).toBeNull();
    expect(requiredLevel("projects" as `${string}:${string}`)).toBeNull();
  });
});

describe("canInProject", () => {
  it("Viewer reads only", () => {
    expect(canInProject("Viewer", "suppliers:read")).toBe(true);
    expect(canInProject("Viewer", "daily-activities:create")).toBe(false);
  });

  it("Contributor writes operational modules but deletes nothing", () => {
    expect(canInProject("Contributor", "daily-activities:update")).toBe(true);
    expect(canInProject("Contributor", "questions-answers:create")).toBe(true);
    expect(canInProject("Contributor", "objectives:create")).toBe(false);
    expect(canInProject("Contributor", "todo-items:delete")).toBe(false);
  });

  it("Manager can do everything in the project", () => {
    for (const verb of ["read", "create", "update", "delete"]) {
      expect(canInProject("Manager", `projects:${verb}`)).toBe(true);
      expect(canInProject("Manager", `parking-lot:${verb}`)).toBe(true);
    }
  });

  it("no access (null) allows nothing, and no level reaches the admin module", () => {
    expect(canInProject(null, "projects:read")).toBe(false);
    for (const level of ACCESS_LEVELS) expect(canInProject(level, "admin:read")).toBe(false);
  });
});
