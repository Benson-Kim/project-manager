import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserRow } from "@/modules/auth/schemas/user";

vi.mock("@/modules/auth/repository/users", () => ({
  getUserById: vi.fn(),
}));

import { getUserById } from "@/modules/auth/repository/users";
import { AppError } from "../errors";
import { getSessionStamp } from "./session-stamp";

const mockGetUserById = vi.mocked(getUserById);

const user: UserRow = {
  UserId: 7,
  Username: "pm",
  DisplayName: "PM",
  Email: null,
  RoleId: 2,
  RoleName: "ProjectManager",
  IsActive: true,
  MustChangePassword: false,
  FailedLoginCount: 0,
  LockedUntilUtc: null,
  SessionVersion: 3,
  CreatedAtUtc: new Date(),
  UpdatedAtUtc: null,
  RowVer: 1,
};

describe("getSessionStamp (ADR-0017 revocation stamp)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns the current stamp for an existing user", async () => {
    mockGetUserById.mockResolvedValue(user);
    expect(await getSessionStamp(7)).toEqual({
      sessionVersion: 3,
      isActive: true,
      mustChangePassword: false,
    });
    expect(mockGetUserById).toHaveBeenCalledWith(7, 7);
  });

  it("reflects deactivation and forced password change", async () => {
    mockGetUserById.mockResolvedValue({ ...user, IsActive: false, MustChangePassword: true });
    expect(await getSessionStamp(7)).toEqual({
      sessionVersion: 3,
      isActive: false,
      mustChangePassword: true,
    });
  });

  it("NOT_FOUND (deleted user) maps to null, not an error", async () => {
    mockGetUserById.mockRejectedValue(new AppError("NOT_FOUND", "User not found"));
    expect(await getSessionStamp(99)).toBeNull();
  });

  it("other AppErrors propagate", async () => {
    mockGetUserById.mockRejectedValue(new AppError("FORBIDDEN_ROW", "denied"));
    await expect(getSessionStamp(7)).rejects.toThrow("denied");
  });

  it("unexpected errors propagate", async () => {
    mockGetUserById.mockRejectedValue(new Error("connection reset"));
    await expect(getSessionStamp(7)).rejects.toThrow("connection reset");
  });
});
