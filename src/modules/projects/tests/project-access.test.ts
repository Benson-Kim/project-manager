import { beforeEach, describe, expect, it, vi } from "vitest";

const execProc = vi.fn();
vi.mock("@/lib/db", () => ({
  execProc: (...args: unknown[]) => execProc(...args) as Promise<unknown[]>,
}));

import { getProjectAccess, getProjectPermissions } from "../repository/project-access";

describe("project access (ADR-0021)", () => {
  beforeEach(() => execProc.mockReset());

  it("reads the actor's level from usp_Project_GetAccess", async () => {
    execProc.mockResolvedValue([{ AccessLevel: "Contributor" }]);
    expect(await getProjectAccess(2, 7)).toBe("Contributor");
    expect(execProc).toHaveBeenCalledWith("usp_Project_GetAccess", {
      ProjectId: 2,
      ActorUserId: 7,
    });
  });

  it("passes a null project through for project-less records", async () => {
    execProc.mockResolvedValue([{ AccessLevel: "Contributor" }]);
    await getProjectAccess(null, 7);
    expect(execProc).toHaveBeenCalledWith("usp_Project_GetAccess", {
      ProjectId: null,
      ActorUserId: 7,
    });
  });

  it("returns null when the actor has no access", async () => {
    execProc.mockResolvedValue([{ AccessLevel: null }]);
    expect(await getProjectAccess(3, 7)).toBeNull();
  });

  it("rejects an unknown level instead of guessing", async () => {
    execProc.mockResolvedValue([{ AccessLevel: "Owner" }]);
    await expect(getProjectAccess(4, 7)).rejects.toThrow();
  });

  it("binds permissions to the level", async () => {
    execProc.mockResolvedValue([{ AccessLevel: "Contributor" }]);
    const allows = await getProjectPermissions(5, 7);
    expect(allows("daily-activities:update")).toBe(true);
    expect(allows("daily-activities:delete")).toBe(false);
    expect(allows("objectives:create")).toBe(false);
  });

  it("allows nothing without access", async () => {
    execProc.mockResolvedValue([{ AccessLevel: null }]);
    const allows = await getProjectPermissions(6, 7);
    expect(allows("projects:read")).toBe(false);
  });
});
