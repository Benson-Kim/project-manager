"use server";

import { action } from "@/lib/action";
import type { Role } from "@/lib/auth/types";
import { AppError } from "@/lib/errors";
import {
  createUser,
  deactivateUser,
  getUserById,
  listRoles,
  setPassword,
  updateUser,
} from "../repository/users";
import {
  adminCreateUserInput,
  adminDeactivateUserInput,
  adminResetPasswordInput,
  adminUpdateUserInput,
} from "../schemas/user";

/**
 * Settings > Users (Admin only). The gate is `admin:users`, which can() refuses to a User, and
 * every proc checks the actor's role again; usp_User_AssertAdminChange keeps the actor's own access
 * and the last active Admin. New accounts and resets always must change password at next sign-in.
 */
const PERMISSION = "admin:users";
const REVALIDATE = ["/settings/users"];

async function roleIdOf(role: Role): Promise<number> {
  const found = (await listRoles()).find((r) => r.Name === role);
  if (!found) throw new AppError("VALIDATION", "Unknown role");
  return found.RoleId;
}

export const createUserAction = action({
  name: "users.create",
  schema: adminCreateUserInput,
  permission: PERMISSION,
  revalidate: REVALIDATE,
  handler: async (input, { session }) => {
    const user = await createUser(
      {
        username: input.username,
        password: input.temporaryPassword,
        displayName: input.displayName,
        email: input.email,
        roleId: await roleIdOf(input.role),
        mustChangePassword: true,
      },
      session.userId,
    );
    return { userId: user.UserId };
  },
});

export const updateUserAction = action({
  name: "users.update",
  schema: adminUpdateUserInput,
  permission: PERMISSION,
  revalidate: REVALIDATE,
  handler: async (input, { session }) => {
    const [stored, roleId] = await Promise.all([
      getUserById(input.userId, session.userId),
      roleIdOf(input.role),
    ]);
    const user = await updateUser(
      {
        userId: input.userId,
        displayName: input.displayName,
        email: input.email,
        roleId,
        isActive: input.isActive,
        mustChangePassword: stored.MustChangePassword,
        rowVer: input.rowVer,
      },
      session.userId,
    );
    return { rowVer: user.RowVer };
  },
});

export const deactivateUserAction = action({
  name: "users.deactivate",
  schema: adminDeactivateUserInput,
  permission: PERMISSION,
  revalidate: REVALIDATE,
  handler: (input, { session }) => deactivateUser(input.userId, input.rowVer, session.userId),
});

export const resetUserPasswordAction = action({
  name: "users.reset-password",
  schema: adminResetPasswordInput,
  permission: PERMISSION,
  revalidate: REVALIDATE,
  handler: (input, { session }) =>
    setPassword(input.userId, input.temporaryPassword, session.userId, true),
});
