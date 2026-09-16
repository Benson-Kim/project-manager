import { SECLISTS_DENYLIST_RAW } from "./password-denylist.data";

/**
 * Password denylist (STANDARDS §4: deny top-10k list). Because the policy
 * already requires >= 12 characters, only denylist entries of 12+ characters
 * can ever match — the length rule excludes the rest of the top-10k for free,
 * so this set only needs the 12+-character entries. The authoritative data is
 * the verified SecLists extraction in ./password-denylist.data.ts (issue #27;
 * source sha256, entry count and MIT attribution recorded there and in
 * docs/SECURITY.md). The hand-seeded starter entries below are kept as
 * project additions — none of them appear in the SecLists subset.
 */
const STARTER_ENTRIES = [
  "1234567890123",
  "123456789012345",
  "1234567890123456",
  "111111111111",
  "1q2w3e4r5t6y7u8i",
  "aaaaaaaaaaaa",
  "abcdefghijkl",
  "administrator",
  "adminadminadmin",
  "iloveyou12345",
  "macromedia123",
  "mypassword123",
  "password1234",
  "password12345",
  "password123456",
  "passwordpassword",
  "qwertyuiop123",
  "qwertyuiopasdfgh",
  "q1w2e3r4t5y6u7i8",
  "qazwsxedcrfvtgb",
  "supercalifragilistic",
  "thepassword1",
  "trustno1trustno1",
  "welcome12345",
] as const;

/**
 * Normalise entries at build time (trim + lowercase) so stray whitespace or
 * casing in the data can never cause a lookup miss — the policy looks up
 * `password.toLowerCase()` against this set.
 */
const normalise = (entry: string): string => entry.trim().toLowerCase();

export const PASSWORD_DENYLIST: ReadonlySet<string> = new Set<string>(
  [...SECLISTS_DENYLIST_RAW.split("\n"), ...STARTER_ENTRIES].map(normalise),
);
