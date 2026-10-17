import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const PROCS = "db/procs/daily-activity";
const sql = (proc: string) => readFileSync(`${PROCS}/${proc}.sql`, "utf8");

const QUOTA_LOCK =
  /EXEC @Lock = sp_getapplock @Resource = @Bucket, @LockMode = 'Exclusive',\s+@LockOwner = 'Transaction'/;

/**
 * The attachment quota (ADR-0026 §6) is a sum over a project's live files, so
 * every write that adds bytes to a project takes that project's quota lock
 * inside its transaction and refuses with QUOTA_EXCEEDED: adding a file, and
 * moving an activity whose files go with it.
 */
describe("attachment quota SQL guardrails", () => {
  it.each(["usp_DailyActivity_AddFile", "usp_DailyActivity_Update"])(
    "%s takes the destination's quota lock inside its transaction",
    (proc) => {
      const text = sql(proc);
      expect(text).toContain("N'file-quota:' + ISNULL(CAST(@ProjectId AS NVARCHAR(12)), N'none')");
      expect(text).toMatch(QUOTA_LOCK);
      expect(text.search(QUOTA_LOCK)).toBeGreaterThan(text.indexOf("BEGIN TRAN"));
      expect(text).toMatch(/THROW 50006, N'QUOTA_EXCEEDED:/);
    },
  );

  it("a move checks the quota before its attachments change project", () => {
    const text = sql("usp_DailyActivity_Update");
    expect(text).toContain("@QuotaBytes BIGINT = NULL");
    expect(text.indexOf("THROW 50006")).toBeLessThan(
      text.indexOf("UPDATE f SET ProjectId = @ProjectId"),
    );
  });
});
