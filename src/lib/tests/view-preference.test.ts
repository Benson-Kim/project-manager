import { beforeEach, describe, expect, it, vi } from "vitest";

const execProc = vi.fn();
vi.mock("../db", () => ({
  execProc: (...args: unknown[]) => execProc(...args) as Promise<unknown[]>,
}));

import {
  getListPreference,
  getViewPreference,
  setListLayout,
  setViewPreference,
} from "../repositories/view-preference";

describe("view-preference repository ", () => {
  beforeEach(() => execProc.mockReset());

  it("returns the stored mode", async () => {
    execProc.mockResolvedValue([{ ViewMode: "list", Layout: null }]);
    await expect(getViewPreference(1, "suppliers")).resolves.toBe("list");
    expect(execProc).toHaveBeenCalledWith("usp_ViewPreference_Get", {
      UserId: 1,
      ModuleKey: "suppliers",
    });
  });

  it("returns null when unset", async () => {
    execProc.mockResolvedValue([]);
    await expect(getViewPreference(1, "suppliers")).resolves.toBeNull();
    await expect(getListPreference(1, "suppliers")).resolves.toBeNull();
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

  it("reads the datasheet layout with the view mode (migration 019); a bad layout reads as none", async () => {
    execProc.mockResolvedValue([
      { ViewMode: "list", Layout: '{"order":["Task","Status"],"widths":{"Task":320}}' },
    ]);
    await expect(getListPreference(2, "daily-activities")).resolves.toEqual({
      viewMode: "list",
      layout: { order: ["Task", "Status"], widths: { Task: 320 } },
    });
    execProc.mockResolvedValue([{ ViewMode: "grid", Layout: "{oops" }]);
    await expect(getListPreference(2, "daily-activities")).resolves.toEqual({
      viewMode: "grid",
      layout: null,
    });
  });

  it("stores a layout as JSON, or null to reset", async () => {
    execProc.mockResolvedValue([]);
    await setListLayout(2, "todo-items", { rowHeight: 64 });
    expect(execProc).toHaveBeenCalledWith("usp_ViewPreference_SetLayout", {
      UserId: 2,
      ModuleKey: "todo-items",
      Layout: '{"rowHeight":64}',
    });
    await setListLayout(2, "todo-items", null);
    expect(execProc).toHaveBeenLastCalledWith("usp_ViewPreference_SetLayout", {
      UserId: 2,
      ModuleKey: "todo-items",
      Layout: null,
    });
  });
});
