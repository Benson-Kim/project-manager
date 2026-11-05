import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppToken } from "../config";

// Capture the config object handed to NextAuth() so the jwt/session callbacks
// can be exercised directly — next-auth's runtime itself cannot load under
// vitest (LESSONS §11), so the framework is mocked away.
const captured = vi.hoisted(() => ({ config: undefined as unknown }));

vi.mock("next-auth", () => ({
  default: (config: unknown) => {
    captured.config = config;
    return { handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() };
  },
}));
vi.mock("next-auth/providers/credentials", () => ({
  default: (config: unknown) => config,
}));
vi.mock("@/modules/auth/repository/users", () => ({
  auditUnknownUsernameLoginFailure: vi.fn(),
  getUserByUsername: vi.fn(),
  recordIpLoginAttempt: vi.fn(),
  recordLoginAttempt: vi.fn(),
}));

const getUserPreference = vi.fn();
vi.mock("@/lib/repositories/user-preference", () => ({
  getUserPreference: (...args: unknown[]) => getUserPreference(...args),
}));

import "../config";

interface CapturedConfig {
  session: { strategy: string; maxAge: number };
  pages: { signIn: string };
  callbacks: {
    jwt: (args: {
      token: Record<string, unknown>;
      user?: Record<string, unknown>;
      trigger?: string;
      session?: unknown;
    }) => Promise<Record<string, unknown> | null>;
    session: (args: {
      session: Record<string, unknown>;
      token: Record<string, unknown>;
    }) => Record<string, unknown>;
  };
}

const cfg = captured.config as CapturedConfig;

const NOW = new Date("2026-11-04T12:00:00Z");
const nowSeconds = NOW.getTime() / 1000;

const appToken: AppToken = {
  userId: 7,
  username: "pm",
  role: "User",
  sessionVersion: 1,
  mustChangePassword: false,
  idleTimeoutMinutes: 15,
  lastActiveAt: nowSeconds - 60,
};

describe("NextAuth config ", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    getUserPreference.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses the JWT strategy capped at 30 days (idle sign-out is per user) and /login page", () => {
    expect(cfg.session).toEqual({ strategy: "jwt", maxAge: 30 * 24 * 60 * 60 });
    expect(cfg.pages).toEqual({ signIn: "/login" });
  });

  it("jwt callback stamps the appToken on sign-in", async () => {
    const token = await cfg.callbacks.jwt({ token: {}, user: { appToken } });
    expect(token?.appToken).toEqual(appToken);
  });

  it("jwt callback marks an active user's token as active now", async () => {
    const token = await cfg.callbacks.jwt({ token: { appToken } });
    expect(token?.appToken).toEqual({ ...appToken, lastActiveAt: nowSeconds });
    expect(getUserPreference).not.toHaveBeenCalled();
  });

  it("jwt callback signs out a user idle past their idle time", async () => {
    const idle = { ...appToken, lastActiveAt: nowSeconds - 15 * 60 - 1 };
    expect(await cfg.callbacks.jwt({ token: { appToken: idle } })).toBeNull();
  });

  it("jwt callback keeps a user who chose Never, however long idle", async () => {
    const never = { ...appToken, idleTimeoutMinutes: 0, lastActiveAt: 0 };
    const token = await cfg.callbacks.jwt({ token: { appToken: never } });
    expect(token?.appToken).toMatchObject({ idleTimeoutMinutes: 0, lastActiveAt: nowSeconds });
  });

  it("jwt callback measures a token minted before idle sign-out from its iat, at the default", async () => {
    const older = { ...appToken, idleTimeoutMinutes: undefined, lastActiveAt: undefined };
    const fresh = await cfg.callbacks.jwt({ token: { iat: nowSeconds - 60, appToken: older } });
    expect(fresh?.appToken).toMatchObject({ idleTimeoutMinutes: 480, lastActiveAt: nowSeconds });
    const stale = { iat: nowSeconds - 8 * 60 * 60 - 1, appToken: older };
    expect(await cfg.callbacks.jwt({ token: stale })).toBeNull();
  });

  it("jwt update re-reads the idle time from the database and ignores the request body", async () => {
    getUserPreference.mockResolvedValue({ dueSoonDays: 2, idleTimeoutMinutes: 60 });
    const token = await cfg.callbacks.jwt({
      token: { appToken },
      trigger: "update",
      session: { appToken: { idleTimeoutMinutes: 0, role: "Admin" } },
    });
    expect(getUserPreference).toHaveBeenCalledWith(7);
    expect(token?.appToken).toEqual({
      ...appToken,
      idleTimeoutMinutes: 60,
      lastActiveAt: nowSeconds,
    });
  });

  it("jwt update cannot revive an idle session", async () => {
    getUserPreference.mockResolvedValue({ dueSoonDays: 2, idleTimeoutMinutes: 0 });
    const idle = { ...appToken, lastActiveAt: nowSeconds - 15 * 60 - 1 };
    expect(await cfg.callbacks.jwt({ token: { appToken: idle }, trigger: "update" })).toBeNull();
  });

  it("jwt update keeps the current idle time when the database cannot be read", async () => {
    getUserPreference.mockRejectedValue(new Error("db down"));
    const token = await cfg.callbacks.jwt({ token: { appToken }, trigger: "update" });
    expect(token?.appToken).toMatchObject({ idleTimeoutMinutes: 15 });
  });

  it("session callback copies the appToken from the JWT", () => {
    const session = cfg.callbacks.session({ session: {}, token: { appToken } });
    expect(session.appToken).toEqual(appToken);
  });

  it("session callback without an appToken leaves the session untouched", () => {
    const session = { user: undefined };
    expect(cfg.callbacks.session({ session, token: {} })).toBe(session);
  });
});
