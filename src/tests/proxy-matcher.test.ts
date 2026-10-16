import * as staticInfo from "next/dist/build/analysis/get-page-static-info";
import { describe, expect, it } from "vitest";
import { config } from "../proxy";

// Exported by Next at runtime but absent from its .d.ts.
const { getMiddlewareMatchers } = staticInfo as unknown as {
  getMiddlewareMatchers(matchers: unknown, nextConfig: object): Array<{ regexp: string }>;
};

/**
 * Guardrail (ADR-0026 §3, ADR-0031): only the attachment routes and the
 * bearer-authenticated internal routes skip the proxy, which buffers request
 * bodies up to 10 MB and is the auth gate and CSP for everything else. The
 * matcher is compiled with Next's own code, so this is what the server will
 * match.
 */
const [matcher] = getMiddlewareMatchers(config.matcher, {});
const proxied = (pathname: string) => new RegExp(matcher!.regexp).test(pathname);

describe("proxy matcher", () => {
  it.each(["/api/files", "/api/files/12", "/api/files/12/x"])("%s streams past the proxy", (p) => {
    expect(proxied(p)).toBe(false);
  });

  it.each(["/api/internal", "/api/internal/todo-alerts/dispatch"])(
    "%s is a bearer-authenticated internal route outside the gate",
    (p) => {
      expect(proxied(p)).toBe(false);
    },
  );

  it.each([
    "/",
    "/projects",
    "/daily-activities",
    "/api/auth/session",
    "/api/due-alerts",
    "/api/filesystem",
    "/api/files-other",
    "/api/internals",
    "/internal/api",
    "/projects/api/internal",
    "/files",
    "/projects/api/files",
  ])("%s still goes through the proxy", (p) => {
    expect(proxied(p)).toBe(true);
  });
});
