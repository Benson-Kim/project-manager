import { beforeEach, describe, expect, it, vi } from "vitest";

const execProc = vi.fn();
vi.mock("@/lib/db", () => ({
  execProc: (...args: unknown[]) => execProc(...args) as Promise<unknown[]>,
}));

import { getTodoPermissions } from "./todo-access";

describe("to-do permissions (mirrors usp_TodoItem_AssertAccess, ADR-0021)", () => {
  beforeEach(() => execProc.mockReset());

  it("a project-less to-do the actor could open is theirs to manage", async () => {
    const allows = await getTodoPermissions({ ProjectId: null }, 7);
    expect(allows("todo-items:delete")).toBe(true);
    expect(allows("todo-alerts:delete")).toBe(true);
    expect(execProc).not.toHaveBeenCalled();
  });

  it("a to-do in a project follows the actor's level there", async () => {
    execProc.mockResolvedValue([{ AccessLevel: "Contributor" }]);
    const allows = await getTodoPermissions({ ProjectId: 3 }, 7);
    expect(execProc).toHaveBeenCalledWith("usp_Project_GetAccess", {
      ProjectId: 3,
      ActorUserId: 7,
    });
    expect(allows("todo-items:update")).toBe(true);
    expect(allows("todo-items:delete")).toBe(false);
  });

  it("a new to-do uses the project-less level", async () => {
    execProc.mockResolvedValue([{ AccessLevel: "Contributor" }]);
    const allows = await getTodoPermissions(null, 7);
    expect(execProc).toHaveBeenCalledWith("usp_Project_GetAccess", {
      ProjectId: null,
      ActorUserId: 7,
    });
    expect(allows("todo-items:create")).toBe(true);
  });
});
