import { expect, test } from "@playwright/test";

/** STANDARDS §4: the full security header set is asserted, not assumed. */
test("security headers are present on documents", async ({ request }) => {
  const res = await request.get("/");
  const headers = res.headers();

  expect(headers["content-security-policy"]).toContain("default-src 'self'");
  expect(headers["content-security-policy"]).toContain("nonce-");
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["content-security-policy"]).not.toContain("script-src 'self' 'unsafe-inline'");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["permissions-policy"]).toContain("camera=()");
});

test("CSP nonce differs per request", async ({ request }) => {
  const nonce = (h: Record<string, string>) =>
    /nonce-([^']+)/.exec(h["content-security-policy"] ?? "")?.[1];
  const first = nonce((await request.get("/")).headers());
  const second = nonce((await request.get("/")).headers());
  expect(first).toBeTruthy();
  expect(second).toBeTruthy();
  expect(first).not.toBe(second);
});

/**
 * ADR-0031: the push dispatch route is outside the login gate because its
 * caller is a scheduler with a bearer token and no cookie. It answers for
 * itself: 503 while push is not configured (CI), 401 for a wrong token, never
 * a redirect to /login.
 */
test("the internal dispatch route is not redirected to login", async ({ request }) => {
  const res = await request.post("/api/internal/todo-alerts/dispatch", { maxRedirects: 0 });
  expect([401, 503]).toContain(res.status());
  expect(res.headers()["location"]).toBeUndefined();
});
