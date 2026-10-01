import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CredentialsRow } from "@/modules/auth/schemas/user";

// next-auth's runtime needs next/server, which does not resolve under vitest
// (node env). authorizeCredentials never touches it — mock the framework away.
vi.mock("next-auth", () => ({
  default: () => ({ handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() }),
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
vi.mock("./password", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./password")>()),
  verifyPassword: vi.fn(),
}));
// getEnv() requires real DB_PASSWORD etc which are absent in unit tests.
// Mock it to return a controlled TRUSTED_PROXY_COUNT; the DB fields are unused
// in authorizeCredentials so their values don't matter here.
vi.mock("@/lib/env", () => ({
  getEnv: vi.fn(),
}));

import {
  auditUnknownUsernameLoginFailure,
  getUserByUsername,
  recordIpLoginAttempt,
  recordLoginAttempt,
} from "@/modules/auth/repository/users";
import { getEnv } from "@/lib/env";
import { authorizeCredentials, getTrustedIp } from "./config";
import { verifyPassword } from "./password";

const mockGetEnv = vi.mocked(getEnv);

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

const credentials = { username: "pm", password: "correct horse battery staple" };

describe("getTrustedIp", () => {
  it("returns unknown when trustedProxyCount=0 regardless of XFF header", () => {
    expect(getTrustedIp(new Headers({ "x-forwarded-for": "1.2.3.4" }), 0)).toBe("unknown");
  });

  it("returns unknown when headers are undefined", () => {
    expect(getTrustedIp(undefined, 1)).toBe("unknown");
  });

  it("returns unknown when XFF header is absent", () => {
    expect(getTrustedIp(new Headers(), 1)).toBe("unknown");
  });

  it("single proxy, single XFF entry: no client entry visible → unknown", () => {
    // Proxy appends the client address it sees: XFF="10.0.0.1" (1 entry).
    // With N=1: candidateIndex = 1-1-1 = -1 → undefined → "unknown".
    // A real deployment always has 2 entries when a client reaches the proxy
    // without sending any XFF; the proxy adds exactly one (the connection address).
    // This case only arises if the proxy strips incoming XFF — use N=0 then.
    expect(getTrustedIp(new Headers({ "x-forwarded-for": "10.0.0.1" }), 1)).toBe("unknown");
  });

  it("single proxy, two XFF entries: strips the rightmost (proxy-set) and returns left", () => {
    // Client sends no XFF; proxy records its connection to 10.0.0.2 and appends it.
    // Also: a client-injected prefix "evil.0.0.1" would appear as index 0.
    // candidateIndex = 2-1-1 = 0 → "evil.0.0.1" (attacker-controlled prefix case).
    // This is the documented single-proxy limitation — see comment in getTrustedIp.
    const headers = new Headers({ "x-forwarded-for": "10.0.0.1, 10.0.0.2" });
    expect(getTrustedIp(headers, 1)).toBe("10.0.0.1");
  });

  it("two proxies, three XFF entries: returns the client entry before both proxy appends", () => {
    // Chain: client(1.2.3.4) → proxy1 → proxy2 → app
    // XFF: "1.2.3.4, proxy1-ip, proxy2-ip"; N=2: candidateIndex = 3-2-1 = 0 → "1.2.3.4"
    const headers = new Headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1, 10.0.0.2" });
    expect(getTrustedIp(headers, 2)).toBe("1.2.3.4");
  });

  it("returns unknown when the chain is shorter than trustedProxyCount + 1", () => {
    // Only 1 entry but N=2: candidateIndex = 1-2-1 = -2 → undefined → "unknown"
    expect(getTrustedIp(new Headers({ "x-forwarded-for": "10.0.0.1" }), 2)).toBe("unknown");
  });

  it("returns unknown for negative trustedProxyCount", () => {
    expect(getTrustedIp(new Headers({ "x-forwarded-for": "1.2.3.4" }), -1)).toBe("unknown");
  });
});

describe("authorizeCredentials (issue #4 required cases)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.AUTH_SECRET = "0".repeat(32);
    // Default: simulate a single-proxy deployment (TRUSTED_PROXY_COUNT=1).
    // Two-entry XFF "10.0.0.1, 127.0.0.1" → candidateIndex=0 → "10.0.0.1".
    mockGetEnv.mockReturnValue({ TRUSTED_PROXY_COUNT: 1 } as ReturnType<typeof getEnv>);
    mockIpAttempt.mockResolvedValue({ Allowed: true, AttemptCount: 1, RetryAfterSeconds: 0 });
    mockUserAttempt.mockResolvedValue({ FailedLoginCount: 0, LockedUntilUtc: null });
  });

  // XFF="10.0.0.1, 127.0.0.1": proxy appended 127.0.0.1 (its own loop address);
  // the real client address it saw was 10.0.0.1 (the leftmost of the two entries).
  const proxyRequest = {
    headers: new Headers({ "x-forwarded-for": "10.0.0.1, 127.0.0.1" }),
  };

  it("success: returns the app token and records a successful attempt", async () => {
    mockGetUser.mockResolvedValue(user);
    mockVerify.mockResolvedValue(true);
    const result = await authorizeCredentials(credentials, proxyRequest);
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
    expect(await authorizeCredentials(credentials, proxyRequest)).toBeNull();
    expect(mockUserAttempt).toHaveBeenCalledWith(7, false, "10.0.0.1");
  });

  it("unknown username: null + LoginFailed audit without an id", async () => {
    mockGetUser.mockResolvedValue(null);
    expect(await authorizeCredentials(credentials, proxyRequest)).toBeNull();
    expect(mockAuditUnknown).toHaveBeenCalledWith("10.0.0.1");
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it("locked account: null before any password verification", async () => {
    mockGetUser.mockResolvedValue({
      ...user,
      LockedUntilUtc: new Date(Date.now() + 60_000),
    });
    expect(await authorizeCredentials(credentials, proxyRequest)).toBeNull();
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it("expired lock: proceeds to verification", async () => {
    mockGetUser.mockResolvedValue({
      ...user,
      LockedUntilUtc: new Date(Date.now() - 60_000),
    });
    mockVerify.mockResolvedValue(true);
    expect(await authorizeCredentials(credentials, proxyRequest)).not.toBeNull();
  });

  it("inactive account: null even with the right password", async () => {
    mockGetUser.mockResolvedValue({ ...user, IsActive: false });
    mockVerify.mockResolvedValue(true);
    expect(await authorizeCredentials(credentials, proxyRequest)).toBeNull();
    expect(mockUserAttempt).toHaveBeenCalledWith(7, false, "10.0.0.1");
  });

  it("must-change: login succeeds and the flag travels in the token", async () => {
    mockGetUser.mockResolvedValue({ ...user, MustChangePassword: true });
    mockVerify.mockResolvedValue(true);
    const result = await authorizeCredentials(credentials, proxyRequest);
    expect(result?.appToken.mustChangePassword).toBe(true);
  });

  it("rate limited IP: null before lookup or verification", async () => {
    mockIpAttempt.mockResolvedValue({ Allowed: false, AttemptCount: 6, RetryAfterSeconds: 30 });
    expect(await authorizeCredentials(credentials, proxyRequest)).toBeNull();
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it("missing AUTH_SECRET: throws instead of silently accepting logins", async () => {
    delete process.env.AUTH_SECRET;
    await expect(authorizeCredentials(credentials, proxyRequest)).rejects.toThrow(/AUTH_SECRET/);
  });

  it("TRUSTED_PROXY_COUNT=0: XFF header is ignored, all clients bucket as 'unknown'", async () => {
    // Direct/local deployment — no trusted proxy, XFF cannot be trusted at all.
    mockGetEnv.mockReturnValue({ TRUSTED_PROXY_COUNT: 0 } as ReturnType<typeof getEnv>);
    mockGetUser.mockResolvedValue(user);
    mockVerify.mockResolvedValue(true);
    const spoofed = { headers: new Headers({ "x-forwarded-for": "evil.1.2.3" }) };
    await authorizeCredentials(credentials, spoofed);
    expect(mockIpAttempt).toHaveBeenCalledWith("unknown");
    expect(mockUserAttempt).toHaveBeenCalledWith(7, true, "unknown");
  });

  it("client-injected XFF prefix is rate-limited under the attacker's own IP (N=1)", async () => {
    // Attacker sends XFF: "evil.1.2.3"; single proxy appends "10.0.0.99".
    // Resulting header: "evil.1.2.3, 10.0.0.99".
    // With N=1: strip rightmost 1 → candidateIndex=0 → "evil.1.2.3".
    // The attacker's brute-force attempts are bucketed under "evil.1.2.3" — their
    // own injected address — not the real "10.0.0.99". The rate limit still applies
    // to whatever address is presented; the attacker gains nothing by rotating their
    // injected prefix (each prefix gets its own bucket, all are rate-limited).
    mockGetUser.mockResolvedValue(user);
    mockVerify.mockResolvedValue(true);
    const spoofed = {
      headers: new Headers({ "x-forwarded-for": "evil.1.2.3, 10.0.0.99" }),
    };
    await authorizeCredentials(credentials, spoofed);
    expect(mockIpAttempt).toHaveBeenCalledWith("evil.1.2.3");
  });
});
