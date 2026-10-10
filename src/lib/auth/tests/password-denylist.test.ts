import { describe, expect, it } from "vitest";
import { PASSWORD_DENYLIST } from "../password-denylist";
import { passwordSchema } from "../password-policy";

describe("SecLists top-10k denylist, 12+-char subset (issue #27)", () => {
  it("rejects known 12+-character SecLists entries via the policy", () => {
    // Straight from the verified xato-net-10-million-passwords-10000 subset.
    expect(passwordSchema.safeParse("sonyericsson").success).toBe(false);
    expect(passwordSchema.safeParse("polniypizdec0211").success).toBe(false);
    expect(passwordSchema.safeParse("1qaz2wsx3edc").success).toBe(false);
  });

  it("still rejects the pre-existing starter entries", () => {
    expect(passwordSchema.safeParse("administrator").success).toBe(false);
    expect(passwordSchema.safeParse("password12345").success).toBe(false);
  });

  it("matches case-insensitively", () => {
    expect(passwordSchema.safeParse("SonyEricsson").success).toBe(false);
    expect(passwordSchema.safeParse("QWERTY123456").success).toBe(false);
  });

  it("accepts an obviously strong passphrase", () => {
    expect(passwordSchema.safeParse("correct horse battery staple").success).toBe(true);
    expect(passwordSchema.safeParse("rusty-Kettle-Orbits-9-Moons").success).toBe(true);
  });

  it("stores every entry trimmed and lowercased (lookup can never miss)", () => {
    for (const entry of PASSWORD_DENYLIST) {
      expect(entry).toBe(entry.trim());
      expect(entry).toBe(entry.toLowerCase());
    }
  });

  it("only ever contains entries the 12+ length rule can reach", () => {
    for (const entry of PASSWORD_DENYLIST) {
      expect(entry.length).toBeGreaterThanOrEqual(12);
    }
  });

  it("has at least the verified SecLists + starter entry count", () => {
    // 24 verified SecLists entries + 24 starter additions, deduped.
    expect(PASSWORD_DENYLIST.size).toBeGreaterThanOrEqual(40);
  });
});
