import { beforeEach, describe, expect, it, vi } from "vitest";

const execProc = vi.fn();
vi.mock("@/lib/db", () => ({
  execProc: (...args: unknown[]) => execProc(...args) as Promise<unknown[]>,
}));

import { choicesFrom, overridesFrom } from "../components/permission-matrix";
import { getProjectPermissions } from "../repository/project-access";
import { listProjectPermissions, setProjectPermissions } from "../repository/project-permissions";

describe("team permission overrides (ADR-0024)", () => {
  beforeEach(() => execProc.mockReset());

  it("lists every member's overrides by user", async () => {
    execProc.mockResolvedValue([
      { UserId: 4, Module: "parking-lot", Verb: "create", Allowed: false },
      { UserId: 4, Module: "keywords", Verb: "delete", Allowed: true },
      { UserId: 5, Module: "todo-items", Verb: "update", Allowed: true },
    ]);
    const byUser = await listProjectPermissions(2, 3);
    expect(execProc).toHaveBeenCalledWith("usp_ProjectPermission_List", {
      ProjectId: 2,
      ActorUserId: 3,
    });
    expect(byUser[4]).toEqual([
      { module: "parking-lot", verb: "create", allowed: false },
      { module: "keywords", verb: "delete", allowed: true },
    ]);
    expect(byUser[5]).toHaveLength(1);
  });

  it("saves one person's overrides as JSON", async () => {
    execProc.mockResolvedValue([{ UserId: 4, Module: "keywords", Verb: "delete", Allowed: true }]);
    const saved = await setProjectPermissions(
      {
        projectId: 2,
        userId: 4,
        overrides: [{ module: "keywords", verb: "delete", allowed: true }],
      },
      3,
    );
    expect(execProc).toHaveBeenCalledWith("usp_ProjectPermission_Set", {
      ProjectId: 2,
      UserId: 4,
      OverridesJson: '[{"module":"keywords","verb":"delete","allowed":true}]',
      ActorUserId: 3,
    });
    expect(saved).toEqual([{ module: "keywords", verb: "delete", allowed: true }]);
  });

  it("rejects a non-overridable section or a repeated cell before the database", async () => {
    await expect(
      setProjectPermissions(
        {
          projectId: 2,
          userId: 4,
          // @ts-expect-error — the charter/team ("projects") never takes overrides
          overrides: [{ module: "projects", verb: "update", allowed: true }],
        },
        3,
      ),
    ).rejects.toThrow();
    await expect(
      setProjectPermissions(
        {
          projectId: 2,
          userId: 4,
          overrides: [
            { module: "keywords", verb: "create", allowed: true },
            { module: "keywords", verb: "create", allowed: false },
          ],
        },
        3,
      ),
    ).rejects.toThrow();
    expect(execProc).not.toHaveBeenCalled();
  });

  it("page permissions apply the actor's own overrides from usp_Project_GetAccess", async () => {
    execProc.mockResolvedValue([
      {
        AccessLevel: "Viewer",
        OverridesJson: '[{"Module":"keywords","Verb":"create","Allowed":true}]',
      },
    ]);
    const allows = await getProjectPermissions(77, 5);
    expect(allows("keywords:create")).toBe(true);
    expect(allows("keywords:update")).toBe(false);
  });
});

describe("permission dialog state", () => {
  it("keeps only the cells that differ from the level", () => {
    const choices = choicesFrom([{ module: "parking-lot", verb: "create", allowed: false }]);
    expect(choices).toEqual({ "parking-lot:create": "deny" });
    // Allowing what a Contributor already may do is no override; denying it is.
    expect(
      overridesFrom("Contributor", {
        "parking-lot:create": "allow",
        "parking-lot:update": "deny",
        "parking-lot:delete": "allow",
        "keywords:create": "",
      }),
    ).toEqual([
      { module: "parking-lot", verb: "update", allowed: false },
      { module: "parking-lot", verb: "delete", allowed: true },
    ]);
  });
});
