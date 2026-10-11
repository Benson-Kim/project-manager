import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/lib/auth/types";

let session: Session | null;
let token: { appToken?: { mustChangePassword: boolean } } | null;

vi.mock("@/lib/auth/provider", () => ({
  auth: { getSession: () => Promise.resolve(session) },
}));
vi.mock("@/lib/auth/config", () => ({ auth: () => Promise.resolve(token) }));
vi.mock("@/lib/db", () => ({ execProc: vi.fn() }));

import { uploadsEnabled } from "@/lib/env";
import { freeBytes } from "@/lib/files/store";
import { AppError, type AppErrorCode } from "@/lib/errors";
import { downloadDeps, uploadDeps } from "../handlers/deps";
import { fileRoute } from "../handlers/file-route";
import { getFileSession } from "../handlers/session";
import { failFromAppError } from "../handlers/upload";

describe("getFileSession: the proxy's rules for routes outside it (ADR-0026 §3)", () => {
  beforeEach(() => {
    session = { userId: 7, username: "pm", role: "User" };
    token = { appToken: { mustChangePassword: false } };
  });

  it("returns the session", async () => {
    expect(await getFileSession()).toEqual(session);
  });

  it("is null when signed out", async () => {
    session = null;
    expect(await getFileSession()).toBeNull();
  });

  it("is null while the account must still change its password", async () => {
    token = { appToken: { mustChangePassword: true } };
    expect(await getFileSession()).toBeNull();
  });
});

describe("fileRoute: the proxy's gate for every /api/files route (ADR-0026 §3)", () => {
  const ORIGIN = "http://127.0.0.1:3000";
  const handler = vi.fn((_req: Request, s: Session, ctx: { id: string }) =>
    Promise.resolve(new Response(`${s.userId}:${ctx.id}`)),
  );
  const route = fileRoute(handler);
  const request = (method: string, headers: Record<string, string> = {}) =>
    new Request(`${ORIGIN}/api/files`, {
      method,
      headers: { host: "127.0.0.1:3000", ...headers },
    });
  const sameOrigin = { origin: ORIGIN, "sec-fetch-site": "same-origin" };

  beforeEach(() => {
    session = { userId: 7, username: "pm", role: "User" };
    token = { appToken: { mustChangePassword: false } };
    handler.mockClear();
  });

  it("runs the handler with the session and the route context", async () => {
    const res = await route(request("POST", sameOrigin), { id: "5" });
    expect(await res.text()).toBe("7:5");
  });

  it.each([
    [
      "a cross-site POST",
      "POST",
      { origin: "https://evil.example", "sec-fetch-site": "cross-site" },
    ],
    ["a foreign Origin", "POST", { origin: "https://evil.example" }],
    ["a cross-site DELETE", "DELETE", { "sec-fetch-site": "cross-site" }],
  ])("refuses %s (403) before the session", async (_l, method, headers) => {
    session = null; // would be 401 if the session were checked first
    const res = await route(request(method, headers), { id: "5" });
    expect(res.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });

  it("lets a GET through without Origin (a download link)", async () => {
    expect((await route(request("GET"), { id: "5" })).status).toBe(200);
  });

  it.each([
    ["signed out", () => (session = null)],
    ["the password must still change", () => (token = { appToken: { mustChangePassword: true } })],
  ])("answers 401 when %s, without running the handler", async (_l, arrange) => {
    arrange();
    const res = await route(request("GET"), { id: "5" });
    expect(res.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });
});

describe("failFromAppError: proc errors → HTTP", () => {
  it.each([
    ["NOT_FOUND", 404, "NOT_FOUND"],
    ["FORBIDDEN_ROW", 404, "NOT_FOUND"],
    ["QUOTA_EXCEEDED", 422, "QUOTA_EXCEEDED"],
    ["VALIDATION", 400, "VALIDATION"],
    ["CONFLICT", 409, "CONFLICT"],
    ["UNAUTHENTICATED", 401, "UNAUTHENTICATED"],
    ["FORBIDDEN", 403, "FORBIDDEN"],
    ["DUPLICATE", 500, "INTERNAL"],
    ["INTERNAL", 500, "INTERNAL"],
  ] as const)("%s → %d %s", async (code, status, answered) => {
    const res = failFromAppError(new AppError(code as AppErrorCode, "detail from the proc"));
    expect(res.status).toBe(status);
    const body = await res.json();
    expect(body.error.code).toBe(answered);
    expect(body.error.message).not.toContain("detail from the proc");
  });
});

describe("route wiring", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses the quota and the free-space floor from the environment, in bytes", () => {
    vi.stubEnv("UPLOADS_QUOTA_MB_PER_PROJECT", "3");
    vi.stubEnv("UPLOADS_MIN_FREE_MB", "5");
    expect(uploadDeps.quotaBytes()).toBe(3 * 1024 * 1024);
    expect(uploadDeps.minFreeBytes()).toBe(5 * 1024 * 1024);
    expect(uploadDeps.freeBytes).toBe(freeBytes);
    expect(uploadDeps.uploadsEnabled).toBe(uploadsEnabled);
    expect(downloadDeps.getFile).toBeTypeOf("function");
  });
});
