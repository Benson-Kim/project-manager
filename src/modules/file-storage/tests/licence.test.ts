import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LicenceStatus } from "@/lib/licence/policy";

let status: LicenceStatus = "off";

vi.mock("@/lib/db", () => ({ execProc: vi.fn() }));
vi.mock("../handlers/session", () => ({
  getFileSession: () => Promise.resolve({ userId: 7, username: "pm", role: "User" }),
}));
vi.mock("@/lib/licence/gate", async (original) => ({
  ...(await original<typeof import("@/lib/licence/gate")>()),
  currentLicenceStatus: () => Promise.resolve(status),
}));

import { fileRoute } from "../handlers/file-route";

describe("fileRoute and the licence", () => {
  const ORIGIN = "http://127.0.0.1:3000";
  const handler = vi.fn(() => Promise.resolve(new Response("ran")));
  const route = fileRoute(handler);
  const request = (method: string) =>
    new Request(`${ORIGIN}/api/files`, {
      method,
      headers: { host: "127.0.0.1:3000", origin: ORIGIN, "sec-fetch-site": "same-origin" },
    });

  beforeEach(() => handler.mockClear());

  it.each(["expired", "reconnect", "unlicensed"] as const)(
    "refuses an upload or delete when the licence is %s",
    async (s) => {
      status = s;
      for (const method of ["POST", "DELETE"]) {
        const res = await route(request(method), {});
        expect(res.status).toBe(403);
        expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
          "LICENCE_INACTIVE",
        );
      }
      expect(handler).not.toHaveBeenCalled();
    },
  );

  it("still serves downloads when the licence is inactive", async () => {
    status = "expired";
    expect(await (await route(request("GET"), {})).text()).toBe("ran");
  });

  it.each(["off", "active"] as const)("accepts an upload when the licence is %s", async (s) => {
    status = s;
    expect(await (await route(request("POST"), {})).text()).toBe("ran");
  });
});
