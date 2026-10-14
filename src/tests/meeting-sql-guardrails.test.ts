import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MEETING_PARTICIPANTS_MAX,
  MEETING_REORDER_MAX,
} from "@/modules/meetings/schemas/meeting-form";

const FOLDERS = [
  "meeting",
  "meeting-agenda-item",
  "meeting-discussion-point",
  "meeting-action-item",
  "meeting-participant",
];

const PROCS = new Map(
  FOLDERS.flatMap((folder) =>
    readdirSync(join("db/procs", folder))
      .filter((f) => f.endsWith(".sql"))
      .map((f) => [f.replace(/\.sql$/, ""), readFileSync(join("db/procs", folder, f), "utf8")]),
  ),
);

function sql(name: string): string {
  const text = PROCS.get(name);
  if (!text) throw new Error(`missing proc ${name}`);
  return text;
}

/** The parameter list between CREATE OR ALTER PROCEDURE and AS. */
function paramsOf(name: string): string {
  const match = /CREATE OR ALTER PROCEDURE \S+([\s\S]*?)\nAS\n/.exec(
    sql(name).replace(/\r\n/g, "\n"),
  );
  return match?.[1] ?? "";
}

/** Whether `needle` appears after the first BEGIN TRAN. */
function afterBeginTran(name: string, needle: string | RegExp): boolean {
  const text = sql(name);
  const tran = text.indexOf("BEGIN TRAN");
  if (tran < 0) return false;
  const rest = text.slice(tran);
  return typeof needle === "string" ? rest.includes(needle) : needle.test(rest);
}

/** Access qryMeetingAttendees' "Name - Position, Organization", written once per proc. */
const LABEL =
  "CONCAT(TRIM(CONCAT(s.FirstName, N' ', s.LastName)), N' - ' + NULLIF(TRIM(s.OrgTitle), N''), N', ' + NULLIF(TRIM(s.DepartmentOrganization), N'')) AS Label";

const LOCK = "FROM app.Meeting WITH (UPDLOCK, HOLDLOCK)";

/** Meetings' rules live in the procs (ADR-0028); these keep them from drifting. */
describe("meeting SQL guardrails", () => {
  it("finds every meeting proc", () => {
    expect(PROCS.size).toBe(34);
  });

  it("labels participants the same way everywhere", () => {
    const labelled = [...PROCS].filter(([, text]) => /AS Label\b/.test(text)).map(([name]) => name);
    expect(labelled.sort()).toEqual(
      [
        "usp_Meeting_GetApologies",
        "usp_Meeting_GetAttendees",
        "usp_Meeting_GetParticipants",
        "usp_Meeting_GetRoster",
        "usp_Meeting_GetWorkspace",
        "usp_MeetingParticipant_Create",
        "usp_MeetingParticipant_GetById",
        "usp_MeetingParticipant_List",
        "usp_MeetingParticipant_Update",
      ].sort(),
    );
    for (const name of labelled) expect(sql(name), name).toContain(LABEL);
  });

  it("returns no stakeholder contact details", () => {
    for (const [name, text] of PROCS) {
      expect(text, name).not.toMatch(/\b(EmailAddress|PhoneNumber|PhoneExt|Mobile|Address)\b/);
    }
  });

  it("locks the meeting inside the transaction before changing which children it has or their order", () => {
    const locking = [
      "usp_MeetingAgendaItem_Create",
      "usp_MeetingAgendaItem_Delete",
      "usp_MeetingAgendaItem_Reorder",
      "usp_MeetingDiscussionPoint_Create",
      "usp_MeetingDiscussionPoint_Delete",
      "usp_MeetingDiscussionPoint_Reorder",
      "usp_MeetingActionItem_Create",
      "usp_MeetingActionItem_Delete",
      "usp_MeetingActionItem_Reorder",
      "usp_MeetingParticipant_Create",
      "usp_MeetingParticipant_Update",
      "usp_MeetingParticipant_Delete",
      "usp_MeetingParticipant_Set",
    ];
    for (const name of locking) expect(afterBeginTran(name, LOCK), name).toBe(true);
  });

  it("checks RowVer inside the transaction on every update and delete", () => {
    const writes = [...PROCS.keys()].filter((n) => /_(Update|Delete)$/.test(n));
    expect(writes).toHaveLength(10);
    for (const name of writes) {
      expect(afterBeginTran(name, "AND CAST(RowVer AS BIGINT) = @RowVer"), name).toBe(true);
    }
  });

  it("checks the participants stamp after taking the lock", () => {
    const text = sql("usp_MeetingParticipant_Set");
    const lock = text.indexOf(LOCK);
    const stamp = text.indexOf("> @Stamp");
    expect(lock).toBeGreaterThan(text.indexOf("BEGIN TRAN"));
    expect(stamp).toBeGreaterThan(lock);
    expect(text.slice(stamp)).toMatch(/^> @Stamp\s+THROW 50002, N'CONFLICT:/);
  });

  it("checks the order against the live siblings after taking the lock", () => {
    for (const name of [
      "usp_MeetingAgendaItem_Reorder",
      "usp_MeetingDiscussionPoint_Reorder",
      "usp_MeetingActionItem_Reorder",
    ]) {
      const text = sql(name);
      const lock = text.indexOf(LOCK);
      expect(lock, name).toBeGreaterThan(text.indexOf("BEGIN TRAN"));
      expect(text.indexOf("THROW 50002, N'CONFLICT:", lock), name).toBeGreaterThan(lock);
    }
  });

  it("never lets an edit move a row to another meeting, parent or project", () => {
    for (const name of [
      "usp_MeetingAgendaItem_Update",
      "usp_MeetingDiscussionPoint_Update",
      "usp_MeetingActionItem_Update",
      "usp_MeetingParticipant_Update",
    ]) {
      expect(paramsOf(name), name).not.toMatch(
        /@(MeetingId|AgendaItemId|DiscussionPointId|StakeholderId|ProjectId)\b/,
      );
    }
    const update = sql("usp_Meeting_Update");
    expect(paramsOf("usp_Meeting_Update")).toMatch(/@ProjectId\s+INT\s+= NULL/);
    expect(update).not.toMatch(/\[ProjectId\]\s*=/);
  });

  it("escapes LIKE wildcards in the list search", () => {
    const list = sql("usp_Meeting_List");
    expect(list).toContain(
      "REPLACE(REPLACE(REPLACE(@Search, N'\\', N'\\\\'), N'%', N'\\%'), N'_', N'\\_')",
    );
    const likes = list.match(/LIKE N'%'[^\n]*/g) ?? [];
    expect(likes).toHaveLength(3);
    for (const like of likes) expect(like).toContain("ESCAPE N'\\'");
  });

  it("builds no SQL from strings", () => {
    for (const [name, text] of PROCS) {
      expect(text, name).not.toMatch(/sp_executesql|EXEC(UTE)?\s*\(/i);
    }
  });

  it("reads JSON ids without trusting their type, within the app's limits", () => {
    for (const name of [
      "usp_MeetingAgendaItem_Reorder",
      "usp_MeetingDiscussionPoint_Reorder",
      "usp_MeetingActionItem_Reorder",
    ]) {
      expect(sql(name), name).toContain("TRY_CAST(");
      expect(sql(name), name).toContain(`FROM @Order) > ${MEETING_REORDER_MAX}`);
    }
    expect(sql("usp_MeetingParticipant_Set")).toContain("TRY_CAST(");
    expect(sql("usp_MeetingParticipant_Set")).toContain(
      `FROM @Wanted) > ${MEETING_PARTICIPANTS_MAX}`,
    );
  });

  it("keeps null keys in the workspace's JSON collections", () => {
    const workspace = sql("usp_Meeting_GetWorkspace");
    expect(workspace.match(/FOR JSON PATH, INCLUDE_NULL_VALUES\) AS \w+Json/g)).toHaveLength(4);
    expect(sql("usp_Meeting_GetRoster")).toContain(
      "FOR JSON PATH, INCLUDE_NULL_VALUES) AS RosterJson",
    );
  });

  it("builds the roster from the meeting's own project, stamp first, within Set's limit", () => {
    const roster = sql("usp_Meeting_GetRoster");
    expect(roster).toContain("WHERE s.ProjectId = @RowProjectId AND s.IsDeleted = 0");
    expect(roster).toContain("AND live.ProjectId = @RowProjectId AND live.IsDeleted = 0");
    const stamp = roster.indexOf("DECLARE @ParticipantsStamp");
    expect(stamp).toBeGreaterThan(roster.indexOf("usp_Project_AssertAccess"));
    expect(stamp).toBeLessThan(roster.indexOf("FROM app.Stakeholder"));
    expect(roster).toContain(`WHERE r.Pick <= ${MEETING_PARTICIPANTS_MAX}`);
  });

  it("calls no other meeting proc or function, since the two runners order the folders differently", () => {
    for (const [name, text] of PROCS) {
      const others = (text.match(/dbo\.(usp|ufn)_Meeting\w*/g) ?? []).filter(
        (m) => m !== `dbo.${name}`,
      );
      expect(others, name).toEqual([]);
    }
  });
});
