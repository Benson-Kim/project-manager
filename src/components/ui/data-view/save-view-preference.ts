"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth/provider";
import { VIEW_MODES } from "@/lib/list-params";
import { setViewPreference } from "@/lib/repositories/view-preference";

const inputSchema = z.object({
  moduleKey: z
    .string()
    .trim()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9-]+$/),
  viewMode: z.enum(VIEW_MODES),
});

/**
 * Preference write . Documented exemption from the action() wrapper
 * and audit log (STANDARDS §6): per-user UI preference, not domain data — zod
 * still validates, sessions still scope it, and the cookie fallback keeps it
 * working for anonymous users until auth (#4).
 */
export async function saveViewPreference(rawInput: unknown): Promise<void> {
  const parsed = inputSchema.safeParse(rawInput);
  if (!parsed.success) return;
  const { moduleKey, viewMode } = parsed.data;

  const cookieStore = await cookies();
  cookieStore.set(`view:${moduleKey}`, viewMode, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });

  const session = await auth.getSession();
  if (session) {
    try {
      await setViewPreference(session.userId, moduleKey, viewMode);
    } catch {
      // Preference persistence is best-effort; the cookie already applied.
    }
  }
}

/** Server-side resolution for a page: proc (when signed in) → cookie → default. */
export async function resolveViewPreference(
  moduleKey: string,
): Promise<(typeof VIEW_MODES)[number]> {
  const session = await auth.getSession();
  if (session) {
    try {
      const { getViewPreference } = await import("@/lib/repositories/view-preference");
      const stored = await getViewPreference(session.userId, moduleKey);
      if (stored) return stored;
    } catch {
      // fall through to cookie
    }
  }
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(`view:${moduleKey}`)?.value;
  return fromCookie === "list" ? "list" : "grid";
}
