import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";
import { passwordSchema } from "./password-policy";

describe("argon2id hashing (STANDARDS §4)", () => {
  it("roundtrips: hash then verify", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash).toMatch(/^\$argon2id\$/);
    // OWASP baseline parameters are encoded in the hash string.
    expect(hash).toContain("m=19456,t=2,p=1");
    await expect(verifyPassword(hash, "correct horse battery staple")).resolves.toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    await expect(verifyPassword(hash, "wrong horse battery staple")).resolves.toBe(false);
  });

  it("returns false (not throw) on a malformed hash", async () => {
    await expect(verifyPassword("not-a-hash", "whatever")).resolves.toBe(false);
  });
});

describe("password policy (min 12, no composition rules, denylist)", () => {
  it("accepts a 12+ character passphrase without special characters", () => {
    expect(passwordSchema.safeParse("just twelve chars").success).toBe(true);
  });

  it("rejects fewer than 12 characters", () => {
    expect(passwordSchema.safeParse("elevenchars").success).toBe(false);
  });

  it("rejects denylisted passwords case-insensitively", () => {
    expect(passwordSchema.safeParse("Password12345").success).toBe(false);
    expect(passwordSchema.safeParse("password12345").success).toBe(false);
  });

  it("rejects more than 128 characters", () => {
    expect(passwordSchema.safeParse("a".repeat(129)).success).toBe(false);
  });
});
