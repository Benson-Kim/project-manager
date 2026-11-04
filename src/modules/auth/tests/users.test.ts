import { beforeEach, describe, expect, it, vi } from "vitest";

const execProc = vi.fn();
vi.mock("@/lib/db", () => ({
  execProc: (...args: unknown[]) => execProc(...args) as Promise<unknown[]>,
}));
vi.mock("@/lib/auth/password", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/password")>()),
  hashPassword: vi.fn(() => Promise.resolve("$argon2id$hashed")),
}));

import { listParamsSchema } from "@/lib/list-params";
import {
  auditLogout,
  auditUnknownUsernameLoginFailure,
  bumpSessionVersion,
  createUser,
  deactivateUser,
  getUserByUsername,
  listRoles,
  listUsers,
  recordIpLoginAttempt,
  recordLoginAttempt,
  setPassword,
  updateUser,
} from "../repository/users";

function dbUserRow(overrides: Record<string, unknown> = {}) {
  return {
    UserId: 7,
    Username: "pm",
    DisplayName: "PM",
    Email: null,
    RoleId: 2,
    RoleName: "User",
    IsActive: true,
    MustChangePassword: false,
    FailedLoginCount: 0,
    LockedUntilUtc: null,
    SessionVersion: 1,
    CreatedAtUtc: new Date("2026-01-01T00:00:00Z"),
    UpdatedAtUtc: null,
    RowVer: "42", // tedious returns BIGINT casts as strings
    ...overrides,
  };
}

describe("users repository", () => {
  beforeEach(() => execProc.mockReset());

  it("getUserByUsername returns null on an empty set (unknown user, no THROW)", async () => {
    execProc.mockResolvedValue([]);
    expect(await getUserByUsername("ghost")).toBeNull();
    expect(execProc).toHaveBeenCalledWith("usp_User_GetByUsername", { Username: "ghost" });
  });

  it("getUserByUsername parses the credentials row incl. hash and coerces RowVer", async () => {
    execProc.mockResolvedValue([dbUserRow({ PasswordHash: "$argon2id$x" })]);
    const user = await getUserByUsername("pm");
    expect(user?.PasswordHash).toBe("$argon2id$x");
    expect(user?.RowVer).toBe(42);
  });

  it("getUserByUsername rejects contract drift (unknown role name)", async () => {
    execProc.mockResolvedValue([dbUserRow({ PasswordHash: "x", RoleName: "SuperAdmin" })]);
    await expect(getUserByUsername("pm")).rejects.toThrow();
  });

  it("listUsers forwards ADR-0016 params 1:1", async () => {
    execProc.mockResolvedValue([{ ...dbUserRow(), TotalCount: 1 }]);
    const params = listParamsSchema.parse({ q: "pm", sort: "Username", page: "2" });
    await listUsers(params, 9);
    expect(execProc).toHaveBeenCalledWith(
      "usp_User_List",
      expect.objectContaining({ ActorUserId: 9, Search: "pm", SortBy: "Username", Page: 2 }),
    );
  });

  it("listUsers returns the page's rows and the proc's TotalCount", async () => {
    execProc.mockResolvedValue([
      { ...dbUserRow(), TotalCount: "31" },
      { ...dbUserRow({ UserId: 8, Username: "pm2" }), TotalCount: "31" },
    ]);
    const { rows, totalCount } = await listUsers(listParamsSchema.parse({}), 1);
    expect(totalCount).toBe(31);
    expect(rows.map((r) => r.UserId)).toEqual([7, 8]);
    expect(rows[0]).not.toHaveProperty("TotalCount");
  });

  it("listUsers reports 0 for an empty page", async () => {
    execProc.mockResolvedValue([]);
    expect(await listUsers(listParamsSchema.parse({}), 1)).toEqual({ rows: [], totalCount: 0 });
  });

  it("updateUser forwards every column, RowVer and the actor", async () => {
    execProc.mockResolvedValue([dbUserRow({ RowVer: "43" })]);
    const user = await updateUser(
      {
        userId: 7,
        displayName: "PM",
        email: null,
        roleId: 1,
        isActive: false,
        mustChangePassword: true,
        rowVer: 42,
      },
      1,
    );
    expect(user.RowVer).toBe(43);
    expect(execProc).toHaveBeenCalledWith("usp_User_Update", {
      UserId: 7,
      DisplayName: "PM",
      Email: null,
      RoleId: 1,
      IsActive: false,
      MustChangePassword: true,
      RowVer: 42,
      ActorUserId: 1,
    });
  });

  it("createUser hashes the password — the plaintext never reaches execProc", async () => {
    execProc.mockResolvedValue([dbUserRow()]);
    await createUser(
      { username: "pm", password: "correct horse battery staple", displayName: "PM", roleId: 2 },
      1,
    );
    const params = execProc.mock.calls[0][1] as Record<string, unknown>;
    expect(params.PasswordHash).toBe("$argon2id$hashed");
    expect(JSON.stringify(params)).not.toContain("correct horse");
    expect(params.MustChangePassword).toBe(true); // default for admin-created users
  });

  it("setPassword hashes and forwards actor + flag", async () => {
    execProc.mockResolvedValue([]);
    await setPassword(7, "new password here", 7);
    expect(execProc).toHaveBeenCalledWith("usp_User_SetPassword", {
      UserId: 7,
      PasswordHash: "$argon2id$hashed",
      MustChangePassword: false,
      ActorUserId: 7,
    });
  });

  it("recordLoginAttempt parses the lockout state", async () => {
    const until = new Date(Date.now() + 30_000);
    execProc.mockResolvedValue([{ FailedLoginCount: 5, LockedUntilUtc: until }]);
    const state = await recordLoginAttempt(7, false, "10.0.0.1");
    expect(state).toEqual({ FailedLoginCount: 5, LockedUntilUtc: until });
  });

  it("recordIpLoginAttempt parses the rate-limit verdict", async () => {
    execProc.mockResolvedValue([{ Allowed: false, AttemptCount: 6, RetryAfterSeconds: 42 }]);
    const state = await recordIpLoginAttempt("10.0.0.1");
    expect(state.Allowed).toBe(false);
    expect(state.RetryAfterSeconds).toBe(42);
  });

  it("listRoles parses the fixed vocabulary", async () => {
    execProc.mockResolvedValue([{ RoleId: 1, Name: "Admin", SortOrder: 1 }]);
    expect(await listRoles()).toEqual([{ RoleId: 1, Name: "Admin", SortOrder: 1 }]);
  });

  it("deactivate and bump forward RowVer/actor to the procs", async () => {
    execProc.mockResolvedValue([]);
    await deactivateUser(7, 42, 1);
    expect(execProc).toHaveBeenCalledWith("usp_User_Deactivate", {
      UserId: 7,
      RowVer: 42,
      ActorUserId: 1,
    });
    await bumpSessionVersion(7, 1);
    expect(execProc).toHaveBeenCalledWith("usp_User_BumpSessionVersion", {
      UserId: 7,
      ActorUserId: 1,
    });
  });

  it("audit helpers go through usp_Audit_Insert", async () => {
    execProc.mockResolvedValue([]);
    await auditLogout(7);
    expect(execProc).toHaveBeenCalledWith("usp_Audit_Insert", {
      ActorUserId: 7,
      Action: "Logout",
      EntityName: "auth.User",
      EntityId: "7",
    });
    await auditUnknownUsernameLoginFailure("10.0.0.1");
    expect(execProc).toHaveBeenCalledWith("usp_Audit_Insert", {
      Action: "LoginFailed",
      EntityName: "auth.User",
      IpAddress: "10.0.0.1",
    });
  });
});
