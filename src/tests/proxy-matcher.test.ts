import { getMiddlewareMatchers } from "next/dist/build/analysis/get-page-static-info";
import { describe, expect, it } from "vitest";
import { config } from "../proxy";

/**
 * Guardrail (ADR-0026 §3): only the attachment routes skip the proxy, which
 * buffers request bodies up to 10 MB and is the auth gate and CSP for
 * everything else. The matcher is compiled with Next's own code, so this is
 * what the server will match.
 */
const [matcher] = getMiddlewareMatchers(config.matcher, {} as never);
const proxied = (pathname: string) => new RegExp(matcher!.regexp).test(pathname);

describe("proxy matcher", () => {
  it.each(["/api/files", "/api/files/12", "/api/files/12/x"])("%s streams past the proxy", (p) => {
    expect(proxied(p)).toBe(false);
  });

  it.each([
    "/",
    "/projects",
    "/daily-activities",
    "/api/auth/session",
    "/api/due-alerts",
    "/api/filesystem",
    "/api/files-other",
    "/files",
    "/projects/api/files",
  ])("%s still goes through the proxy", (p) => {
    expect(proxied(p)).toBe(true);
  });
});
