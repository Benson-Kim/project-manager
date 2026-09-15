/**
 * Password denylist (STANDARDS §4: deny top-10k list). Because the policy
 * already requires >= 12 characters, only denylist entries of 12+ characters
 * can ever match — the length rule excludes the rest of the top-10k for free,
 * so this set only needs the 12+-character entries. The set below is a
 * hand-seeded starter; issue #4 tracks replacing it with the verified
 * 12+-character extraction from SecLists “10-million-password-list-top-10000”
 * (MIT licence — record the source + licence in docs/SECURITY.md when landed).
 */
const ENTRIES = [
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

export const PASSWORD_DENYLIST: ReadonlySet<string> = new Set<string>(ENTRIES);
