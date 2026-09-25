import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Guardrail (docs/SECURITY.md, STANDARDS §4): React's development build needs
 * eval(), so the CSP allows 'unsafe-eval' in development ONLY. Shipping it to
 * production would defeat nonce + strict-dynamic, so that must fail loudly.
 */
async function scriptSrcFor(nodeEnv: string): Promise<string> {
  vi.stubEnv("NODE_ENV", nodeEnv);
  vi.resetModules();
  const { proxy } = await import("../proxy");
  const response = await proxy(new NextRequest("https://example.test/"));
  const csp = response.headers.get("content-security-policy") ?? "";
  const directive = csp
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("script-src"));
  expect(directive, `no script-src in CSP: ${csp}`).toBeDefined();
  return directive as string;
}

describe("proxy CSP", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("allows unsafe-eval in development (React dev build requires it)", async () => {
    expect(await scriptSrcFor("development")).toContain("'unsafe-eval'");
  });

  it.each(["production", "test"])("never allows unsafe-eval in %s", async (env) => {
    expect(await scriptSrcFor(env)).not.toContain("'unsafe-eval'");
  });

  it("keeps nonce and strict-dynamic in production", async () => {
    const directive = await scriptSrcFor("production");
    expect(directive).toMatch(/'nonce-[^']+'/);
    expect(directive).toContain("'strict-dynamic'");
  });
});
