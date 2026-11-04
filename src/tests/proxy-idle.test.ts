import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getToken = vi.fn();
vi.mock("next-auth/jwt", () => ({ getToken: (...args: unknown[]) => getToken(...args) }));

const NOW = new Date("2026-11-04T12:00:00Z");
const nowSeconds = NOW.getTime() / 1000;

/**
 * Guardrail (ADR-0057): the proxy signs out a user idle past their own idle
 * sign-out time, as it does an expired cookie, so a page never renders for them.
 */
async function requestPage(): Promise<Response> {
  const { proxy } = await import("../proxy");
  const request = new NextRequest("https://example.test/projects");
  request.cookies.set("authjs.session-token", "sealed");
  return proxy(request);
}

function appToken(fields: { idleTimeoutMinutes?: number; lastActiveAt?: number }) {
  return {
    iat: nowSeconds - 60,
    appToken: { userId: 1, mustChangePassword: false, ...fields },
  };
}

describe("proxy idle sign-out", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
    getToken.mockReset();
  });

  it("redirects to /login?reason=expired once the user's idle time has passed", async () => {
    getToken.mockResolvedValue(
      appToken({ idleTimeoutMinutes: 15, lastActiveAt: nowSeconds - 15 * 60 - 1 }),
    );
    const response = await requestPage();
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://example.test/login?reason=expired");
  });

  it("lets an active user through", async () => {
    getToken.mockResolvedValue(
      appToken({ idleTimeoutMinutes: 15, lastActiveAt: nowSeconds - 14 * 60 }),
    );
    const response = await requestPage();
    expect(response.headers.get("location")).toBeNull();
  });

  it("never signs out on idle when the user chose Never", async () => {
    getToken.mockResolvedValue(appToken({ idleTimeoutMinutes: 0, lastActiveAt: 0 }));
    const response = await requestPage();
    expect(response.headers.get("location")).toBeNull();
  });

  it("measures a token minted before idle sign-out from its iat, at the default time", async () => {
    getToken.mockResolvedValue({
      iat: nowSeconds - 8 * 60 * 60 - 1,
      appToken: { userId: 1, mustChangePassword: false },
    });
    const response = await requestPage();
    expect(response.headers.get("location")).toBe("https://example.test/login?reason=expired");
  });
});
