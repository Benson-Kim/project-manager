import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guardrail: user management is Admin only in the procs too, not just at the action gate
 * (src/lib/action.ts), and no change can take the actor's own access away or leave the system
 * without an active Admin. This reads db/procs/user and fails when a check goes missing.
 */
const proc = (name: string) => readFileSync(join("db", "procs", "user", `${name}.sql`), "utf8");

const ADMIN_CHECK = /usp_User_GetActorRole[\s\S]*?IF @ActorRole <> N'Admin'\s+THROW 50003/;

describe("user procs check the actor's role themselves", () => {
  it.each(["usp_User_Create", "usp_User_List"])("%s refuses anyone but an Admin", (name) => {
    expect(proc(name)).toMatch(ADMIN_CHECK);
  });

  // GetById: the per-request session check (src/lib/auth/session-stamp.ts) reads the user's own
  // row for every role, including a deactivated user it must sign out, so self is never refused.
  // A NULL actor must not pass as "self": `@UserId <> NULL` is unknown, which would skip the check.
  it.each(["usp_User_GetById", "usp_User_SetPassword"])(
    "%s serves the user's own row, and only an Admin another's",
    (name) => {
      expect(proc(name)).toMatch(
        /IF @ActorUserId IS NULL OR @UserId <> @ActorUserId\s+BEGIN[\s\S]*?usp_User_GetActorRole[\s\S]*?IF @ActorRole <> N'Admin'\s+THROW 50003/,
      );
    },
  );

  it("the session check reads the signed-in user's own row", () => {
    const stamp = readFileSync(join("src", "lib", "auth", "session-stamp.ts"), "utf8");
    expect(stamp).toMatch(/getUserById\(userId, userId\)/);
  });

  it.each(["usp_User_Update", "usp_User_Deactivate"])(
    "%s runs the admin-change rules inside its transaction, before it looks the user up or writes",
    (name) => {
      const source = proc(name);
      const begin = source.indexOf("BEGIN TRAN");
      const assert = source.indexOf("EXEC dbo.usp_User_AssertAdminChange");
      const notFound = source.indexOf("NOT_FOUND");
      const update = source.indexOf("UPDATE auth.[User]");
      expect(begin).toBeGreaterThan(-1);
      expect(assert).toBeGreaterThan(begin);
      expect(notFound).toBeGreaterThan(assert);
      expect(update).toBeGreaterThan(assert);
    },
  );
});

describe("usp_User_AssertAdminChange", () => {
  const source = proc("usp_User_AssertAdminChange");

  it("locks the active Admins until the caller commits, so two demotions cannot both pass", () => {
    expect(source).toMatch(/FROM auth\.\[User\] WITH \(UPDLOCK, HOLDLOCK\)/);
  });

  it("refuses a non-Admin, a change to oneself, and removing the last active Admin", () => {
    expect(source).toMatch(/@ActorIsAdmin, 0\) = 0\s+THROW 50003/);
    expect(source).toMatch(/@UserId = @ActorUserId AND @LosesAdmin = 1\s+THROW 50004/);
    expect(source).toMatch(/@LosesAdmin = 1 AND @OtherAdmins = 0\s+THROW 50004/);
  });
});
