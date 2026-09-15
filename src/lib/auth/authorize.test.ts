import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CredentialsRow } from "@/modules/auth/schemas/user";

vi.mock("@/modules/auth/repository/users", () => ({
  auditUnknownUsernameLoginFailure: vi.fn(),
  getUserByUsername: vi.fn(),
  recordIpLoginAttempt: vi.fn(),
  recordLoginAttempt: vi.fn(),
}));
vi.mock("./password", () => ({ verifyPassword: vi.fn() }));

import {
  auditUnknownUsernameLoginFailure,
  getUserByUsername,
  recordIpLoginAttempt,
  recordLoginAttempt,
} from "@/modules/auth/repository/users";
import { authorizeCredentials } from "./config";
import { verifyPassword } from "./password";

const mockGetUser = vi.mocked(getUserByUsername);
const mockIpAttempt = vi.mocked(recordIpLoginAttempt);
const mockUserAttempt = vi.mocked(recordLoginAttempt);
const mockAuditUnknown = vi.mocked(auditUnknownUsernameLoginFailure);
const mockVerify = vi.mocked(verifyPassword);

const user: CredentialsRow = {
  UserId: 7,
  Username: "pm",
  PasswordHash: "$argon2id$stub",
  DisplayName: "PM",
  Email: null,
  RoleId: 2,
  RoleName: "ProjectManager",
  IsActive: true,
  MustChangePassword: false,
  FailedLoginCount: 0,
  LockedUntilUtc: null,
  SessionVersion: 1,
  CreatedAtUtc: new Date(),
  UpdatedAtUtc: null,
  RowVer: 1,
};

const request = { headers: new Headers({ "x-forwarded-for": "10.0.0.1" }) };
const credentials = { username: "pm", password: "correct horse battery staple" };

describe("authorizeCredentials (issue #4 required cases)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.AUTH_SECRET = "0".repeat(32);
    mockIpAttempt.mockResolvedValue({ Allowed: true, AttemptCount: 1, RetryAfterSeconds: 0 });
    mockUserAttempt.mockResolvedValue({ FailedLoginCount: 0, LockedUntilUtc: null });
  });

  it("success: returns the app token and records a successful attempt", async () => {
    mockGetUser.mockResolvedValue(user);
    mockVerify.mockResolvedValue(true);
    const result = await authorizeCredentials(credentials, request);
    expect(result).toEqual({
      id: "7",
      appToken: {
        userId: 7,
        username: "pm",
        role: "ProjectManager",
        sessionVersion: 1,
        mustChangePassword: false,
      },
    });
    expect(mockUserAttempt).toHaveBeenCalledWith(7, true, "10.0.0.1");
  });

  it("wrong password: null + failed attempt recorded (generic to the caller)", async () => {
    mockGetUser.mockResolvedValue(user);
    mockVerify.mockResolvedValue(false);
    expect(await authorizeCredentials(credentials, request)).toBeNull();
    expect(mockUserAttempt).toHaveBeenCalledWith(7, false, "10.0.0.1");
  });

  it("unknown username: null + LoginFailed audit without an id", async () => {
    mockGetUser.mockResolvedValue(null);
    expect(await authorizeCredentials(credentials, request)).toBeNull();
    expect(mockAuditUnknown).toHaveBeenCalledWith("10.0.0.1");
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it("locked account: null before any password verification", async () => {
    mockGetUser.mockResolvedValue({
      ...user,
      LockedUntilUtc: new Date(Date.now() + 60_000),
    });
    expect(await authorizeCredentials(credentials, request)).toBeNull();
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it("expired lock: proceeds to verification", async () => {
    mockGetUser.mockResolvedValue({
      ...user,
      LockedUntilUtc: new Date(Date.now() - 60_000),
    });
    mockVerify.mockResolvedValue(true);
    expect(await authorizeCredentials(credentials, request)).not.toBeNull();
  });

  it("inactive account: null even with the right password", async () => {
    mockGetUser.mockResolvedValue({ ...user, IsActive: false });
    mockVerify.mockResolvedValue(true);
    expect(await authorizeCredentials(credentials, request)).toBeNull();
    expect(mockUserAttempt).toHaveBeenCalledWith(7, false, "10.0.0.1");
  });

  it("must-change: login succeeds and the flag travels in the token", async () => {
    mockGetUser.mockResolvedValue({ ...user, MustChangePassword: true });
    mockVerify.mockResolvedValue(true);
    const result = await authorizeCredentials(credentials, request);
    expect(result?.appToken.mustChangePassword).toBe(true);
  });

  it("rate limited IP: null before lookup or verification", async () => {
    mockIpAttempt.mockResolvedValue({ Allowed: false, AttemptCount: 6, RetryAfterSeconds: 30 });
    expect(await authorizeCredentials(credentials, request)).toBeNull();
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it("missing AUTH_SECRET: throws instead of silently accepting logins", async () => {
    delete process.env.AUTH_SECRET;
    await expect(authorizeCredentials(credentials, request)).rejects.toThrow(/AUTH_SECRET/);
  });
});
