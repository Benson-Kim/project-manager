import { z } from "zod";
import { ROLES } from "@/lib/auth/types";
import { passwordSchema } from "@/lib/auth/password-policy";

/** tedious returns CAST(RowVer AS BIGINT) as a string — coerce (LESSONS §10). */
const rowVerSchema = z.coerce.number().int().nonnegative();

/** usp_User_List / usp_User_GetById / usp_User_Create / usp_User_Update row (no PasswordHash). */
export const userRowSchema = z.object({
  UserId: z.number().int(),
  Username: z.string(),
  DisplayName: z.string(),
  Email: z.string().nullable(),
  RoleId: z.number().int(),
  RoleName: z.enum(ROLES).optional(),
  IsActive: z.boolean(),
  MustChangePassword: z.boolean(),
  FailedLoginCount: z.number().int(),
  LockedUntilUtc: z.date().nullable(),
  SessionVersion: z.number().int(),
  CreatedAtUtc: z.date(),
  UpdatedAtUtc: z.date().nullable(),
  RowVer: rowVerSchema,
});
export type UserRow = z.infer<typeof userRowSchema>;

/** usp_User_GetByUsername row — the ONLY shape that carries the hash. */
export const credentialsRowSchema = userRowSchema.extend({
  PasswordHash: z.string(),
  RoleName: z.enum(ROLES),
});
export type CredentialsRow = z.infer<typeof credentialsRowSchema>;

export const roleRowSchema = z.object({
  RoleId: z.number().int(),
  Name: z.enum(ROLES),
  SortOrder: z.number().int(),
});
export type RoleRow = z.infer<typeof roleRowSchema>;

/** usp_User_RecordLoginAttempt result. */
export const loginAttemptStateSchema = z.object({
  FailedLoginCount: z.number().int(),
  LockedUntilUtc: z.date().nullable(),
});
export type LoginAttemptState = z.infer<typeof loginAttemptStateSchema>;

/** usp_LoginAttempt_Check / usp_LoginAttempt_Record result. */
export const rateLimitStateSchema = z.object({
  Allowed: z.boolean(),
  AttemptCount: z.number().int(),
  RetryAfterSeconds: z.number().int(),
});
export type RateLimitState = z.infer<typeof rateLimitStateSchema>;

/** Login form input (client + server, single schema). */
export const loginInput = z.object({
  username: z.string().trim().min(1, "Enter your username").max(100),
  password: z.string().min(1, "Enter your password").max(128),
});
export type LoginInput = z.input<typeof loginInput>;

/** Forced password change (/change-password). */
export const changePasswordInput = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password").max(128),
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, "Repeat the new password").max(128),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });
export type ChangePasswordInput = z.input<typeof changePasswordInput>;

/** usp_User_Create input (admin module #23 calls this through the repository). */
export const createUserInput = z.object({
  username: z.string().trim().min(1).max(100),
  password: passwordSchema,
  displayName: z.string().trim().min(1).max(255),
  email: z.string().trim().max(255).nullable().default(null),
  roleId: z.number().int().positive(),
  mustChangePassword: z.boolean().default(true),
});
export type CreateUserInput = z.input<typeof createUserInput>;
