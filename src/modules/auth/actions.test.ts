import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CredentialsRow } from "./schemas/user";

// next-auth's runtime needs next/server (unresolvable under vitest, LESSONS
// §11) — mock the framework; the AuthError class here is the one actions.ts
// imports, so instanceof checks work.
vi.mock("next-auth", () => {
  class AuthError extends Error {}
  return { AuthError, default: () => ({}) };
});
vi.mock("@/lib/auth/config", () => ({
  signIn: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("@/lib/auth/provider", () => ({
  auth: { getSession: vi.fn(), requireSession: vi.fn() },
}));
vi.mock("@/lib/auth/password", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/password")>()),
  verifyPassword: vi.fn(),
}));
vi.mock("./repository/users", () => ({
  auditLogout: vi.fn(),
  getUserByUsername: vi.fn(),
  setPassword: vi.fn(),
}));

import { AuthError } from "next-auth";
import { auth as authProvider } from "@/lib/auth/provider";
import { signIn, signOut } from "@/lib/auth/config";
import { verifyPassword } from "@/lib/auth/password";
import { messages } from "@/lib/messages";
import { changePasswordAction, loginAction, logoutAction } from "./actions";
import { auditLogout, getUserByUsername, setPassword } from "./repository/users";

const mockSignIn = vi.mocked(signIn);
const mockSignOut = vi.mocked(signOut);
const mockGetSession = vi.mocked(authProvider.getSession);
const mockRequireSession = vi.mocked(authProvider.requireSession);
const mockGetUser = vi.mocked(getUserByUsername);
const mockSetPassword = vi.mocked(setPassword);
const mockAuditLogout = vi.mocked(auditLogout);
const mockVerify = vi.mocked(verifyPassword);

const session = { userId: 7, username: "pm", role: "ProjectManager" as const };

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

function loginForm(username = "pm", password = "current-secret-phrase"): FormData {
  const fd = new FormData();
  fd.set("username", username);
  fd.set("password", password);
  return fd;
}

const NEW_PASSWORD = "unusual-tulip-cadence-42";

function changeForm(
  currentPassword = "current-secret-phrase",
  newPassword = NEW_PASSWORD,
  confirmPassword = newPassword,
): FormData {
  const fd = new FormData();
  fd.set("currentPassword", currentPassword);
  fd.set("newPassword", newPassword);
  fd.set("confirmPassword", confirmPassword);
  return fd;
}

describe("loginAction", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("invalid form: same generic message as a wrong password, signIn never called", async () => {
    const fd = new FormData();
    fd.set("username", "pm"); // password missing
    const result = await loginAction(null, fd);
    expect(result).toEqual({
      ok: false,
      error: { code: "VALIDATION", message: messages.auth.loginFailed },
    });
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it("AuthError from signIn: ONE generic failure message (no enumeration)", async () => {
    mockSignIn.mockRejectedValue(new AuthError("CredentialsSignin"));
    const result = await loginAction(null, loginForm());
    expect(result).toEqual({
      ok: false,
      error: { code: "UNAUTHENTICATED", message: messages.auth.loginFailed },
    });
  });

  it("NEXT_REDIRECT (success path) is rethrown for Next to handle", async () => {
    const redirect = new Error("NEXT_REDIRECT");
    mockSignIn.mockRejectedValue(redirect);
    await expect(loginAction(null, loginForm())).rejects.toBe(redirect);
    expect(mockSignIn).toHaveBeenCalledWith("credentials", {
      username: "pm",
      password: "current-secret-phrase",
      redirectTo: "/",
    });
  });

  it("signIn resolving without a redirect falls back to INTERNAL", async () => {
    mockSignIn.mockResolvedValue(undefined as never);
    const result = await loginAction(null, loginForm());
    expect(result).toEqual({
      ok: false,
      error: { code: "INTERNAL", message: messages.errors.INTERNAL },
    });
  });
});

describe("logoutAction", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("audits the logout for the signed-in user, then signs out", async () => {
    mockGetSession.mockResolvedValue(session);
    await logoutAction();
    expect(mockAuditLogout).toHaveBeenCalledWith(7);
    expect(mockSignOut).toHaveBeenCalledWith({ redirectTo: "/login" });
  });

  it("without a session: no audit row, still signs out", async () => {
    mockGetSession.mockResolvedValue(null);
    await logoutAction();
    expect(mockAuditLogout).not.toHaveBeenCalled();
    expect(mockSignOut).toHaveBeenCalledWith({ redirectTo: "/login" });
  });
});

describe("changePasswordAction", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockRequireSession.mockResolvedValue(session);
    mockGetUser.mockResolvedValue(user);
    mockVerify.mockResolvedValue(true);
  });

  it("no session: UNAUTHENTICATED", async () => {
    mockRequireSession.mockRejectedValue(new Error("no session"));
    const result = await changePasswordAction(null, changeForm());
    expect(result).toEqual({
      ok: false,
      error: { code: "UNAUTHENTICATED", message: messages.errors.UNAUTHENTICATED },
    });
    expect(mockSetPassword).not.toHaveBeenCalled();
  });

  it("mismatched confirmation: VALIDATION with a field error", async () => {
    const result = await changePasswordAction(
      null,
      changeForm("current-secret-phrase", NEW_PASSWORD, "something-else-entirely"),
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error.code).toBe("VALIDATION");
    expect(result.error.fieldErrors?.confirmPassword).toEqual(["Passwords do not match"]);
    expect(mockSetPassword).not.toHaveBeenCalled();
  });

  it("wrong current password: generic field error, password unchanged", async () => {
    mockVerify.mockResolvedValue(false);
    const result = await changePasswordAction(null, changeForm());
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error.fieldErrors?.currentPassword).toEqual([
      messages.auth.currentPasswordWrong,
    ]);
    expect(mockSetPassword).not.toHaveBeenCalled();
  });

  it("unknown user row: same generic field error (no enumeration)", async () => {
    mockGetUser.mockResolvedValue(null);
    const result = await changePasswordAction(null, changeForm());
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error.fieldErrors?.currentPassword).toEqual([
      messages.auth.currentPasswordWrong,
    ]);
    expect(mockSetPassword).not.toHaveBeenCalled();
  });

  it("success: sets the password (revoking sessions) then re-signs in (redirect rethrown)", async () => {
    const redirect = new Error("NEXT_REDIRECT");
    mockSignIn.mockRejectedValue(redirect);
    await expect(changePasswordAction(null, changeForm())).rejects.toBe(redirect);
    expect(mockSetPassword).toHaveBeenCalledWith(7, NEW_PASSWORD, 7);
    expect(mockSignIn).toHaveBeenCalledWith("credentials", {
      username: "pm",
      password: NEW_PASSWORD,
      redirectTo: "/",
    });
  });

  it("password changed but re-login failed: UNAUTHENTICATED (user lands on /login)", async () => {
    mockSignIn.mockRejectedValue(new AuthError("CredentialsSignin"));
    const result = await changePasswordAction(null, changeForm());
    expect(mockSetPassword).toHaveBeenCalledWith(7, NEW_PASSWORD, 7);
    expect(result).toEqual({
      ok: false,
      error: { code: "UNAUTHENTICATED", message: messages.errors.UNAUTHENTICATED },
    });
  });

  it("signIn resolving without a redirect falls back to INTERNAL", async () => {
    mockSignIn.mockResolvedValue(undefined as never);
    const result = await changePasswordAction(null, changeForm());
    expect(result).toEqual({
      ok: false,
      error: { code: "INTERNAL", message: messages.errors.INTERNAL },
    });
  });
});
