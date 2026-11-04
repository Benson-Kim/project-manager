import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionResult } from "@/lib/action";
import type { Session } from "@/lib/auth/types";
import type { AppErrorCode } from "@/lib/errors";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));

let session: Session | null = { userId: 1, username: "admin", role: "Admin" };
vi.mock("@/lib/auth/provider", () => ({
  auth: {
    getSession: () => Promise.resolve(session),
    requireSession: async () => {
      if (!session) {
        const { AppError } = await import("@/lib/errors");
        throw new AppError("UNAUTHENTICATED", "Sign in to continue");
      }
      return session;
    },
  },
}));

vi.mock("../repository/users", () => ({
  createUser: vi.fn(),
  updateUser: vi.fn(),
  deactivateUser: vi.fn(),
  setPassword: vi.fn(),
  getUserById: vi.fn(),
  listRoles: vi.fn(),
}));

import { revalidatePath } from "next/cache";
import { AppError } from "@/lib/errors";
import { resetRateLimits } from "@/lib/rate-limit";
import {
  createUserAction,
  deactivateUserAction,
  resetUserPasswordAction,
  updateUserAction,
} from "../actions/users";
import {
  createUser,
  deactivateUser,
  getUserById,
  listRoles,
  setPassword,
  updateUser,
} from "../repository/users";
import type { UserRow } from "../schemas/user";

const TEMP = "harbour lantern quietly";

function storedUser(overrides: Partial<UserRow> = {}): UserRow {
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
    RowVer: 42,
    ...overrides,
  };
}

const validCreate = {
  username: "new.user",
  displayName: "New User",
  email: "",
  role: "User",
  temporaryPassword: TEMP,
};
const validUpdate = {
  userId: 7,
  displayName: "PM",
  email: "pm@example.com",
  role: "Admin",
  isActive: true,
  rowVer: 42,
};
const validDeactivate = { userId: 7, rowVer: 42 };
const validReset = { userId: 7, temporaryPassword: TEMP };

const repository = [createUser, updateUser, deactivateUser, setPassword, getUserById];

beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimits();
  session = { userId: 1, username: "admin", role: "Admin" };
  vi.mocked(listRoles).mockResolvedValue([
    { RoleId: 1, Name: "Admin", SortOrder: 1 },
    { RoleId: 2, Name: "User", SortOrder: 2 },
  ]);
  vi.mocked(createUser).mockResolvedValue(storedUser({ UserId: 9 }));
  vi.mocked(getUserById).mockResolvedValue(storedUser());
  vi.mocked(updateUser).mockResolvedValue(storedUser({ RowVer: 43 }));
});

describe("user admin actions: function-level authorization", () => {
  const cases: [string, () => Promise<ActionResult<unknown>>][] = [
    ["create", () => createUserAction(validCreate)],
    ["update", () => updateUserAction(validUpdate)],
    ["deactivate", () => deactivateUserAction(validDeactivate)],
    ["reset password", () => resetUserPasswordAction(validReset)],
  ];

  it.each(cases)("%s is FORBIDDEN to a User, and nothing reaches the database", async (_, run) => {
    session = { userId: 7, username: "pm", role: "User" };
    const result = await run();
    expect(result).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    for (const fn of repository) expect(fn).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it.each(cases)("%s asks a signed-out caller to sign in", async (_, run) => {
    session = null;
    const result = await run();
    expect(result).toMatchObject({ ok: false, error: { code: "UNAUTHENTICATED" } });
    for (const fn of repository) expect(fn).not.toHaveBeenCalled();
  });
});

describe("user admin actions: mass assignment", () => {
  it.each([
    "passwordHash",
    "mustChangePassword",
    "sessionVersion",
    "failedLoginCount",
    "lockedUntil",
    "isDeleted",
    "roleId",
    "isActive",
  ])("create rejects a client-sent %s", async (key) => {
    const result = await createUserAction({ ...validCreate, [key]: key === "roleId" ? 1 : false });
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    expect(createUser).not.toHaveBeenCalled();
  });

  it.each(["mustChangePassword", "sessionVersion", "passwordHash", "roleId", "username"])(
    "update rejects a client-sent %s",
    async (key) => {
      const result = await updateUserAction({ ...validUpdate, [key]: key === "roleId" ? 1 : true });
      expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
      expect(updateUser).not.toHaveBeenCalled();
    },
  );

  it("reset rejects a client-sent mustChangePassword: false", async () => {
    const result = await resetUserPasswordAction({ ...validReset, mustChangePassword: false });
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    expect(setPassword).not.toHaveBeenCalled();
  });

  it("deactivate rejects extra keys and a missing rowVer", async () => {
    expect(await deactivateUserAction({ ...validDeactivate, isActive: false })).toMatchObject({
      ok: false,
      error: { code: "VALIDATION" },
    });
    expect(await deactivateUserAction({ userId: 7 })).toMatchObject({
      ok: false,
      error: { code: "VALIDATION" },
    });
    expect(deactivateUser).not.toHaveBeenCalled();
  });

  it("rejects an unknown role name before the database", async () => {
    const result = await createUserAction({ ...validCreate, role: "SuperAdmin" });
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    expect(createUser).not.toHaveBeenCalled();
  });
});

describe("user admin actions: what the server sets", () => {
  it("create always forces a password change, resolves the role and uses the session actor", async () => {
    const result = await createUserAction(validCreate);
    expect(result).toEqual({ ok: true, data: { userId: 9 } });
    expect(createUser).toHaveBeenCalledWith(
      {
        username: "new.user",
        password: TEMP,
        displayName: "New User",
        email: null,
        roleId: 2,
        mustChangePassword: true,
      },
      1,
    );
    expect(revalidatePath).toHaveBeenCalledWith("/settings/users");
  });

  it("update keeps the stored MustChangePassword and reads the row as the session actor", async () => {
    vi.mocked(getUserById).mockResolvedValue(storedUser({ MustChangePassword: true }));
    const result = await updateUserAction(validUpdate);
    expect(result).toEqual({ ok: true, data: { rowVer: 43 } });
    expect(getUserById).toHaveBeenCalledWith(7, 1);
    expect(updateUser).toHaveBeenCalledWith(
      {
        userId: 7,
        displayName: "PM",
        email: "pm@example.com",
        roleId: 1,
        isActive: true,
        mustChangePassword: true,
        rowVer: 42,
      },
      1,
    );
  });

  it("reset always forces a password change at next sign-in", async () => {
    const result = await resetUserPasswordAction(validReset);
    expect(result).toMatchObject({ ok: true });
    expect(setPassword).toHaveBeenCalledWith(7, TEMP, 1, true);
  });

  it("deactivate forwards the target, its RowVer and the session actor", async () => {
    const result = await deactivateUserAction(validDeactivate);
    expect(result).toMatchObject({ ok: true });
    expect(deactivateUser).toHaveBeenCalledWith(7, 42, 1);
  });

  it("a userId in the payload never replaces the session actor", async () => {
    session = { userId: 3, username: "other.admin", role: "Admin" };
    await resetUserPasswordAction(validReset);
    expect(setPassword).toHaveBeenCalledWith(7, TEMP, 3, true);
  });
});

describe("user admin actions: proc refusals", () => {
  const refusals: [AppErrorCode, string][] = [
    ["CONFLICT", "a stale RowVer"],
    ["VALIDATION", "the self or last-Admin rule"],
    ["FORBIDDEN_ROW", "a non-Admin actor"],
    ["NOT_FOUND", "an unknown user"],
  ];

  it.each(refusals)("passes %s (%s) through and revalidates nothing", async (code) => {
    vi.mocked(updateUser).mockRejectedValue(new AppError(code, "refused"));
    const result = await updateUserAction(validUpdate);
    expect(result).toMatchObject({ ok: false, error: { code } });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
