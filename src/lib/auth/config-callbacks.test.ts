import { describe, expect, it, vi } from "vitest";
import type { AppToken } from "./config";

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

import "./config";

interface CapturedConfig {
  session: { strategy: string; maxAge: number };
  pages: { signIn: string };
  callbacks: {
    jwt: (args: {
      token: Record<string, unknown>;
      user?: Record<string, unknown>;
    }) => Record<string, unknown>;
    session: (args: {
      session: Record<string, unknown>;
      token: Record<string, unknown>;
    }) => Record<string, unknown>;
  };
}

const cfg = captured.config as CapturedConfig;

const appToken: AppToken = {
  userId: 7,
  username: "pm",
  role: "ProjectManager",
  sessionVersion: 1,
  mustChangePassword: false,
};

describe("NextAuth config (ADR-0017)", () => {
  it("uses the JWT strategy with the 8h idle expiry and /login page", () => {
    expect(cfg.session).toEqual({ strategy: "jwt", maxAge: 8 * 60 * 60 });
    expect(cfg.pages).toEqual({ signIn: "/login" });
  });

  it("jwt callback stamps the appToken on sign-in", () => {
    const token = cfg.callbacks.jwt({ token: {}, user: { appToken } });
    expect(token.appToken).toEqual(appToken);
  });

  it("jwt callback leaves the token untouched on subsequent requests", () => {
    const existing = { appToken };
    expect(cfg.callbacks.jwt({ token: existing })).toBe(existing);
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
