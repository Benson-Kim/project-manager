import { beforeEach, describe, expect, it, vi } from "vitest";

const execProc = vi.fn();
vi.mock("../db", () => ({
  execProc: (...args: unknown[]) => execProc(...args) as Promise<unknown[]>,
}));

import { getViewPreference, setViewPreference } from "./view-preference";

describe("view-preference repository ", () => {
  beforeEach(() => execProc.mockReset());

  it("returns the stored mode", async () => {
    execProc.mockResolvedValue([{ ViewMode: "list" }]);
    await expect(getViewPreference(1, "suppliers")).resolves.toBe("list");
    expect(execProc).toHaveBeenCalledWith("usp_ViewPreference_Get", {
      UserId: 1,
      ModuleKey: "suppliers",
    });
  });

  it("returns null when unset", async () => {
    execProc.mockResolvedValue([]);
    await expect(getViewPreference(1, "suppliers")).resolves.toBeNull();
  });

  it("rejects rows that break the contract", async () => {
    execProc.mockResolvedValue([{ ViewMode: "carousel" }]);
    await expect(getViewPreference(1, "suppliers")).rejects.toThrow();
  });

  it("forwards writes to the proc 1:1", async () => {
    execProc.mockResolvedValue([]);
    await setViewPreference(7, "projects", "grid");
    expect(execProc).toHaveBeenCalledWith("usp_ViewPreference_Set", {
      UserId: 7,
      ModuleKey: "projects",
      ViewMode: "grid",
    });
  });
});
