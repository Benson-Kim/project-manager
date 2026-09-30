"use server";

import { AuthError } from "next-auth";
import { auth as authProvider } from "@/lib/auth/provider";
import { signIn, signOut } from "@/lib/auth/config";
import { verifyPassword } from "@/lib/auth/password";
import { messages } from "@/lib/messages";
import type { ActionResult } from "@/lib/action";
import { auditLogout, getUserByUsername, setPassword } from "../repository/users";
import { changePasswordInput, loginInput } from "../schemas/user";

/**
 * Auth server actions. These sit OUTSIDE the action() wrapper deliberately:
 * login/change-password run without (or while replacing) a session, and their
 * failure copy must stay generic (STANDARDS §4) rather than field-mapped.
 * CSRF: Server Actions are origin-checked by Next; the Auth.js routes carry
 * their own CSRF token.
 */

export async function loginAction(
  _prev: ActionResult<never> | null,
  formData: FormData,
): Promise<ActionResult<never>> {
  const parsed = loginInput.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    // Same generic message as a wrong password — no enumeration surface.
    return { ok: false, error: { code: "VALIDATION", message: messages.auth.loginFailed } };
  }

  try {
    await signIn("credentials", {
      username: parsed.data.username,
      password: parsed.data.password,
      redirectTo: "/",
    });
    // signIn redirects on success (NEXT_REDIRECT is rethrown by the catch).
    return { ok: false, error: { code: "INTERNAL", message: messages.errors.INTERNAL } };
  } catch (err) {
    if (err instanceof AuthError) {
      return {
        ok: false,
        error: { code: "UNAUTHENTICATED", message: messages.auth.loginFailed },
      };
    }
    throw err; // NEXT_REDIRECT and unexpected errors propagate
  }
}

export async function logoutAction(): Promise<void> {
  try {
    // Best-effort audit: a transient DB outage must not leave the cookie
    // intact (especially dangerous on a shared device).  Both getSession()
    // and auditLogout() require the database; either can throw.
    const session = await authProvider.getSession();
    if (session) await auditLogout(session.userId);
  } catch {
    // Intentionally swallowed — proceed to sign out regardless.
  } finally {
    await signOut({ redirectTo: "/login" });
  }
}

export async function changePasswordAction(
  _prev: ActionResult<never> | null,
  formData: FormData,
): Promise<ActionResult<never>> {
  const session = await authProvider.requireSession().catch(() => null);
  if (!session) {
    return {
      ok: false,
      error: { code: "UNAUTHENTICATED", message: messages.errors.UNAUTHENTICATED },
    };
  }

  const parsed = changePasswordInput.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "_";
      (fieldErrors[key] ??= []).push(issue.message);
    }
    return {
      ok: false,
      error: { code: "VALIDATION", message: messages.errors.VALIDATION, fieldErrors },
    };
  }

  const user = await getUserByUsername(session.username);
  if (!user || !(await verifyPassword(user.PasswordHash, parsed.data.currentPassword))) {
    return {
      ok: false,
      error: {
        code: "VALIDATION",
        message: messages.errors.VALIDATION,
        fieldErrors: { currentPassword: [messages.auth.currentPasswordWrong] },
      },
    };
  }

  // Bumps SessionVersion (revokes every session incl. this one), then signs
  // straight back in with the new password so the user lands on the app.
  await setPassword(user.UserId, parsed.data.newPassword, user.UserId);

  try {
    await signIn("credentials", {
      username: session.username,
      password: parsed.data.newPassword,
      redirectTo: "/",
    });
    return { ok: false, error: { code: "INTERNAL", message: messages.errors.INTERNAL } };
  } catch (err) {
    if (err instanceof AuthError) {
      // Password was changed but re-login failed.  The old cookie is now
      // stale (SessionVersion was bumped), so clear it before returning —
      // otherwise requireSession() will reject every subsequent request and
      // the user is stuck.  redirectTo is not used here; the client reads the
      // UNAUTHENTICATED code and navigates to /login.
      await signOut({ redirect: false });
      return {
        ok: false,
        error: { code: "UNAUTHENTICATED", message: messages.errors.UNAUTHENTICATED },
      };
    }
    throw err;
  }
}
