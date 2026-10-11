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
import { AppError, type AppErrorCode } from "@/lib/errors";
import { downloadDeps, uploadDeps } from "../handlers/deps";
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

  it("uses the file session and the quota from the environment, in bytes", () => {
    vi.stubEnv("UPLOADS_QUOTA_MB_PER_PROJECT", "3");
    expect(uploadDeps.quotaBytes()).toBe(3 * 1024 * 1024);
    expect(uploadDeps.getSession).toBe(getFileSession);
    expect(downloadDeps.getSession).toBe(getFileSession);
    expect(uploadDeps.uploadsEnabled).toBe(uploadsEnabled);
  });
});
