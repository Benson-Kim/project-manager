import { describe, expect, it } from "vitest";
import { can } from "./rbac";

describe("role→permission matrix  / PLAN §9)", () => {
  it("Admin can do everything including admin module", () => {
    expect(can("Admin", "suppliers:delete")).toBe(true);
    expect(can("Admin", "admin:update")).toBe(true);
  });

  it("ProjectManager has full domain access but no admin module", () => {
    expect(can("ProjectManager", "projects:create")).toBe(true);
    expect(can("ProjectManager", "suppliers:delete")).toBe(true);
    expect(can("ProjectManager", "admin:read")).toBe(false);
  });

  it("Contributor reads everything (except admin) and writes operational modules only", () => {
    expect(can("Contributor", "projects:read")).toBe(true);
    expect(can("Contributor", "admin:read")).toBe(false);
    expect(can("Contributor", "meetings:create")).toBe(true);
    expect(can("Contributor", "todo-alerts:update")).toBe(true);
    expect(can("Contributor", "projects:update")).toBe(false);
    expect(can("Contributor", "meetings:delete")).toBe(false);
  });

  it("Viewer is read-only", () => {
    expect(can("Viewer", "projects:read")).toBe(true);
    expect(can("Viewer", "projects:create")).toBe(false);
    expect(can("Viewer", "admin:read")).toBe(false);
  });

  it("rejects malformed permissions", () => {
    expect(can("Viewer", "projects" as `${string}:${string}`)).toBe(false);
  });
});
