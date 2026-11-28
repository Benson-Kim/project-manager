import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const PROCS = "db/procs";
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
  it.each([
    "daily-activity/usp_DailyActivity_AddFile",
    "daily-activity/usp_DailyActivity_Update",
    "note/usp_Note_AddFile",
  ])("%s takes the destination's quota lock inside its transaction", (proc) => {
    const text = sql(proc);
    expect(text).toContain("N'file-quota:' + ISNULL(CAST(@ProjectId AS NVARCHAR(12)), N'none')");
    expect(text).toMatch(QUOTA_LOCK);
    expect(text.search(QUOTA_LOCK)).toBeGreaterThan(text.indexOf("BEGIN TRAN"));
    expect(text).toMatch(/THROW 50006, N'QUOTA_EXCEEDED:/);
  });

  it("a move checks the quota before its attachments change project", () => {
    const text = sql("daily-activity/usp_DailyActivity_Update");
    expect(text).toContain("@QuotaBytes BIGINT = NULL");
    expect(text.indexOf("THROW 50006")).toBeLessThan(
      text.indexOf("UPDATE f SET ProjectId = @ProjectId"),
    );
  });
});

/**
 * Pictures pasted into a daily activity's comments are attachments the list
 * leaves out; a save that drops a picture from the comments frees its quota.
 */
describe("pictures pasted into daily-activity comments", () => {
  const update = sql("daily-activity/usp_DailyActivity_Update");
  const reconcile = update.slice(update.indexOf("DECLARE @Unshown"));

  it("only an uploaded file can be marked as pasted", () => {
    expect(sql("daily-activity/usp_DailyActivity_AddFile")).toMatch(
      /IF ISNULL\(@IsInline, 0\) = 1 AND @IsFile = 0\s+THROW 50004/,
    );
  });

  it("are left out of the attachment list but still served", () => {
    expect(sql("daily-activity/usp_DailyActivity_ListFiles")).toMatch(
      /WHERE l\.DailyActivityId = @DailyActivityId AND l\.IsInline = 0 AND f\.IsDeleted = 0/,
    );
    expect(sql("daily-activity/usp_DailyActivity_GetFile")).not.toMatch(/IsInline/);
  });

  it("are removed in the save's transaction once the comments no longer link them", () => {
    expect(update.indexOf("DECLARE @Unshown")).toBeGreaterThan(update.indexOf("BEGIN TRAN"));
    expect(update.indexOf("FROM @Unshown r")).toBeLessThan(update.lastIndexOf("COMMIT"));
    expect(reconcile).toMatch(
      /OUTPUT inserted\.FileAttachmentId INTO @Unshown\s+FROM app\.FileAttachment f\s+JOIN app\.DailyActivityFile l ON l\.FileAttachmentId = f\.FileAttachmentId\s+WHERE l\.DailyActivityId = @DailyActivityId AND l\.IsInline = 1 AND f\.IsDeleted = 0\s+AND CHARINDEX\(N'\/api\/files\/' \+ CAST\(f\.FileAttachmentId AS NVARCHAR\(12\)\) \+ N'\?owner=daily-activity',\s+ISNULL\(@Comments, N''\)\) = 0;/,
    );
    expect(reconcile).toMatch(
      /SELECT @ActorUserId, N'Delete', N'app\.FileAttachment'[\s\S]*?FROM @Unshown r;/,
    );
  });

  it("never removes an uploaded attachment on save", () => {
    expect(update.match(/IsDeleted\s+= 1/g)).toHaveLength(1);
    expect(reconcile).toMatch(/l\.IsInline = 1/);
  });

  it("matches the link the editor writes for a pasted picture", () => {
    expect(readFileSync("src/components/ui/rich-text/editor-surface.tsx", "utf8")).toContain(
      "`/api/files/${outcome.id}?owner=${target.owner}`",
    );
  });
});
