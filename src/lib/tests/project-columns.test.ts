import { describe, it, expect, vi } from "vitest";
import type { Permission } from "@/lib/auth/types";
import { loadProjectColumns, type ColumnRights } from "../custom-columns/project-columns";

const rights: ColumnRights = {
  create: "daily-activities:create",
  update: "daily-activities:update",
  delete: "daily-activities:delete",
};

function deps(granted: Permission[]) {
  return {
    columns: {
      listLabels: vi.fn(async () => []),
      listColumns: vi.fn(async () => []),
    },
    permissions: vi.fn(async () => (p: Permission) => granted.includes(p)),
    rights,
  };
}

describe("loadProjectColumns", () => {
  it("loads nothing when no single project is picked", async () => {
    const d = deps([]);
    expect(await loadProjectColumns(null, d, 7)).toBeNull();
    expect(d.columns.listLabels).not.toHaveBeenCalled();
    expect(d.columns.listColumns).not.toHaveBeenCalled();
    expect(d.permissions).not.toHaveBeenCalled();
  });

  it("loads the picked project's columns as the signed-in user", async () => {
    const d = deps([]);
    const result = await loadProjectColumns(42, d, 7);
    expect(d.columns.listLabels).toHaveBeenCalledWith(42, 7);
    expect(d.columns.listColumns).toHaveBeenCalledWith(42, 7);
    expect(d.permissions).toHaveBeenCalledWith(42, 7);
    expect(result?.projectId).toBe(42);
  });

  it("maps the user's rights on that project to column rights", async () => {
    const result = await loadProjectColumns(
      42,
      deps(["daily-activities:create", "daily-activities:delete"]),
      7,
    );
    expect(result?.canManageColumns).toEqual({ create: true, update: false, delete: true });
  });
});
