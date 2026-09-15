import { afterEach, describe, expect, it } from "vitest";
import { auth } from "./provider";

describe("dev-stub auth provider (ADR-0015)", () => {
  const original = process.env.AUTH_DEV_BYPASS;

  afterEach(() => {
    if (original === undefined) delete process.env.AUTH_DEV_BYPASS;
    else process.env.AUTH_DEV_BYPASS = original;
  });

  it("returns no session without the dev bypass flag (safe default)", async () => {
    delete process.env.AUTH_DEV_BYPASS;
    await expect(auth.getSession()).resolves.toBeNull();
  });

  it("requireSession throws UNAUTHENTICATED without a session", async () => {
    delete process.env.AUTH_DEV_BYPASS;
    await expect(auth.requireSession()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("returns the Admin dev session only when AUTH_DEV_BYPASS=1", async () => {
    process.env.AUTH_DEV_BYPASS = "1";
    await expect(auth.requireSession()).resolves.toMatchObject({ userId: 1, role: "Admin" });
  });
});
