import { execProc } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { hashPassword } from "@/lib/auth/password";
import { DEFAULT_PAGE_SIZE, toProcListParams, type ListParams } from "@/lib/list-params";
import {
  createUserInput,
  credentialsRowSchema,
  loginAttemptStateSchema,
  rateLimitStateSchema,
  roleRowSchema,
  userRowSchema,
  type CreateUserInput,
  type CredentialsRow,
  type LoginAttemptState,
  type RateLimitState,
  type RoleRow,
  type UserRow,
} from "../schemas/user";

/**
 * User/auth repository — stored procedures only , zod row parsing
 * (STANDARDS §2.5), list params forwarded 1:1 . PasswordHash never
 * leaves this module except inside CredentialsRow for authorize().
 */

/** Credentials lookup — empty result means unknown username (no THROW: the
 *  login failure message stays generic either way). */
export async function getUserByUsername(username: string): Promise<CredentialsRow | null> {
  const rows = await execProc<CredentialsRow>("usp_User_GetByUsername", { Username: username });
  if (rows.length === 0) return null;
  return credentialsRowSchema.parse(rows[0]);
}

export async function getUserById(userId: number, actorUserId: number): Promise<UserRow> {
  const rows = await execProc<UserRow>("usp_User_GetById", {
    UserId: userId,
    ActorUserId: actorUserId,
  });
  if (!rows[0]) throw new AppError("NOT_FOUND", "User not found");
  return userRowSchema.parse(rows[0]);
}

export async function listUsers(
  params: ListParams,
  actorUserId: number,
  projectId: number | null = null,
  pageSize: number = DEFAULT_PAGE_SIZE,
): Promise<UserRow[]> {
  const rows = await execProc<UserRow>("usp_User_List", {
    ActorUserId: actorUserId,
    ProjectId: projectId,
    ...toProcListParams(params, pageSize),
  });
  return rows.map((r) => userRowSchema.parse(r));
}

export async function createUser(input: CreateUserInput, actorUserId: number): Promise<UserRow> {
  const parsed = createUserInput.parse(input);
  const rows = await execProc<UserRow>("usp_User_Create", {
    Username: parsed.username,
    PasswordHash: await hashPassword(parsed.password),
    DisplayName: parsed.displayName,
    Email: parsed.email ?? null,
    RoleId: parsed.roleId,
    MustChangePassword: parsed.mustChangePassword,
    ActorUserId: actorUserId,
  });
  return userRowSchema.parse(rows[0]);
}

export async function setPassword(
  userId: number,
  newPassword: string,
  actorUserId: number,
  mustChangePassword = false,
): Promise<void> {
  await execProc("usp_User_SetPassword", {
    UserId: userId,
    PasswordHash: await hashPassword(newPassword),
    MustChangePassword: mustChangePassword,
    ActorUserId: actorUserId,
  });
}

export async function deactivateUser(
  userId: number,
  rowVer: number,
  actorUserId: number,
): Promise<void> {
  await execProc("usp_User_Deactivate", {
    UserId: userId,
    RowVer: rowVer,
    ActorUserId: actorUserId,
  });
}

export async function bumpSessionVersion(userId: number, actorUserId: number): Promise<void> {
  await execProc("usp_User_BumpSessionVersion", {
    UserId: userId,
    ActorUserId: actorUserId,
  });
}

/** Per-user lockout state machine + in-proc Login/LoginFailed audit rows. */
export async function recordLoginAttempt(
  userId: number,
  success: boolean,
  ipAddress: string | null,
): Promise<LoginAttemptState> {
  const rows = await execProc<LoginAttemptState>("usp_User_RecordLoginAttempt", {
    UserId: userId,
    Success: success,
    IpAddress: ipAddress,
  });
  return loginAttemptStateSchema.parse(rows[0]);
}

/** Fixed-window 5/min/IP — Record increments atomically and reports Allowed. */
export async function recordIpLoginAttempt(ipAddress: string): Promise<RateLimitState> {
  const rows = await execProc<RateLimitState>("usp_LoginAttempt_Record", {
    IpAddress: ipAddress,
  });
  return rateLimitStateSchema.parse(rows[0]);
}

export async function listRoles(): Promise<RoleRow[]> {
  const rows = await execProc<RoleRow>("usp_Role_List", {});
  return rows.map((r) => roleRowSchema.parse(r));
}

/** Failed-login audit row for unknown usernames (no UserId to attribute). */
export async function auditUnknownUsernameLoginFailure(ipAddress: string | null): Promise<void> {
  await execProc("usp_Audit_Insert", {
    Action: "LoginFailed",
    EntityName: "auth.User",
    IpAddress: ipAddress,
  });
}

/** Logout audit row (usp_Audit_Insert is the sanctioned helper for app-layer events). */
export async function auditLogout(userId: number): Promise<void> {
  await execProc("usp_Audit_Insert", {
    ActorUserId: userId,
    Action: "Logout",
    EntityName: "auth.User",
    EntityId: String(userId),
  });
}
