import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_DUE_SOON_DAYS,
  DUE_SOON_DAY_OPTIONS,
  dueSoonDaysInput,
} from "@/modules/todo-items/schemas/todo-item";
import { DEFAULT_IDLE_TIMEOUT_MINUTES, IDLE_TIMEOUT_OPTIONS } from "@/lib/auth/idle-timeout";

/**
 * Guardrail: the "Due soon" window is the user's own choice (migration 059). The alerts proc,
 * the table, the setter and the TypeScript options must agree on the default and the range, or
 * the to-do list and the Upcoming alerts panel would disagree about what is due soon.
 */
function sql(path: string): string {
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}

describe("Due soon window", () => {
  const alerts = sql("db/procs/todo-item/usp_Todo_GetUpcomingAlerts.sql");
  const table = sql("db/migrations/059_user_preference.sql");
  const setter = sql("db/procs/user-preference/usp_UserPreference_SetDueSoonDays.sql");

  it("is read from the user's preference row in usp_Todo_GetUpcomingAlerts", () => {
    expect(alerts).not.toMatch(/DATEADD\(DAY,\s*-2\b/);
    expect(alerts).toMatch(
      /SELECT DueSoonDays FROM app\.UserPreference WHERE UserId = @ActorUserId\), 2\);/,
    );
    expect(alerts.match(/DATEADD\(DAY, -@DueSoonDays, t\.\[DueDate\]\)/g)).toHaveLength(2);
  });

  it("defaults to the same number of days in SQL and TypeScript", () => {
    expect(table).toMatch(/DF_UserPreference_DueSoonDays DEFAULT 2\b/);
    expect(DEFAULT_DUE_SOON_DAYS).toBe(2);
    expect(DUE_SOON_DAY_OPTIONS).toContain(DEFAULT_DUE_SOON_DAYS);
  });

  it("is limited to 1..30 days by the table, the setter and the input schema", () => {
    expect(table).toMatch(/CHECK \(DueSoonDays BETWEEN 1 AND 30\)/);
    expect(setter).toMatch(/IF @DueSoonDays IS NULL OR @DueSoonDays NOT BETWEEN 1 AND 30/);
    expect(setter).toMatch(/THROW 50004, N'VALIDATION:/);
    for (const days of DUE_SOON_DAY_OPTIONS) {
      expect(days).toBeGreaterThanOrEqual(1);
      expect(days).toBeLessThanOrEqual(30);
    }
    expect(dueSoonDaysInput.safeParse({ dueSoonDays: 7 }).success).toBe(true);
    expect(dueSoonDaysInput.safeParse({ dueSoonDays: 4 }).success).toBe(false);
    expect(dueSoonDaysInput.safeParse({ dueSoonDays: 31 }).success).toBe(false);
  });

  it("writes only the signed-in user's own row", () => {
    expect(setter).toMatch(/USING \(SELECT @ActorUserId AS UserId\) AS source/);
    expect(setter).not.toMatch(/@UserId\b/);
  });
});

describe("Idle sign-out time", () => {
  const table = sql("db/migrations/060_user_preference_idle_timeout.sql");
  const getter = sql("db/procs/user-preference/usp_UserPreference_Get.sql");
  const setter = sql("db/procs/user-preference/usp_UserPreference_SetIdleTimeout.sql");

  it("defaults to the same 8 hours in the table, the getter and TypeScript", () => {
    expect(table).toMatch(/DF_UserPreference_IdleTimeoutMinutes DEFAULT 480\b/);
    expect(getter).toMatch(/COALESCE\(p\.IdleTimeoutMinutes, 480\)/);
    expect(DEFAULT_IDLE_TIMEOUT_MINUTES).toBe(480);
  });

  it("allows Never (0) or 5..1440 minutes in the table and the setter, covering every option", () => {
    expect(table).toMatch(
      /CHECK \(IdleTimeoutMinutes = 0 OR IdleTimeoutMinutes BETWEEN 5 AND 1440\)/,
    );
    expect(setter).toMatch(
      /@IdleTimeoutMinutes <> 0 AND @IdleTimeoutMinutes NOT BETWEEN 5 AND 1440/,
    );
    for (const minutes of IDLE_TIMEOUT_OPTIONS) {
      expect(minutes === 0 || (minutes >= 5 && minutes <= 1440)).toBe(true);
    }
  });

  it("only ever writes the session user's own row", () => {
    expect(setter).toMatch(/USING \(SELECT @ActorUserId AS UserId\) AS source/);
    expect(setter).not.toMatch(/@UserId\b/);
  });
});
