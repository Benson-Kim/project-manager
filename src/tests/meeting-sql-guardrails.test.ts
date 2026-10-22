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

/** Access qryMeetingAttendees' "Name - Position, Organization" for a stakeholder, written once per proc. */
const LABEL =
  "CONCAT(TRIM(CONCAT(s.FirstName, N' ', s.LastName)), N' - ' + NULLIF(TRIM(s.OrgTitle), N''), N', ' + NULLIF(TRIM(s.DepartmentOrganization), N''))";
/** "Name - Organization" for a guest (migration 033). */
const GUEST_LABEL = "CONCAT(mp.GuestName, N' - ' + NULLIF(TRIM(mp.GuestOrganization), N''))";
/** A participant row's label: the guest's, or the stakeholder's. */
const PERSON_LABEL = `CASE WHEN mp.StakeholderId IS NULL THEN ${GUEST_LABEL} ELSE ${LABEL} END AS Label`;

const LOCK = "FROM app.Meeting WITH (UPDLOCK, HOLDLOCK)";

/** Meetings' rules live in the procs (ADR-0028); these keep them from drifting. */
describe("meeting SQL guardrails", () => {
  it("finds every meeting proc", () => {
    expect(PROCS.size).toBe(34);
  });

  it("labels participants the same way everywhere, guests included", () => {
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
    for (const name of labelled) {
      const text = sql(name);
      expect(text, name).toContain(GUEST_LABEL);
      if (name === "usp_Meeting_GetRoster") {
        expect(text).toContain(`${LABEL} AS Label`);
        expect(text).toContain(`${GUEST_LABEL} AS Label`);
      } else {
        expect(text, name).toContain(PERSON_LABEL);
        expect(text, name).toContain(
          "LEFT JOIN app.Stakeholder AS s ON s.StakeholderId = mp.StakeholderId",
        );
        expect(text, name).not.toContain(
          "ORDER BY s.FirstName, s.LastName, mp.MeetingParticipantId",
        );
      }
    }
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

  it("saves guests by name: one identity per item, listed once, never as a stakeholder row", () => {
    const text = sql("usp_MeetingParticipant_Set");
    const flat = text.replace(/\s+/g, " ");
    expect(text).toContain(
      "(StakeholderId IS NOT NULL AND GuestName IS NULL AND GuestOrganization IS NULL)",
    );
    expect(text).toContain("OR (StakeholderId IS NULL AND GuestName IS NOT NULL))");
    expect(text).toContain("LEN(GuestName) > 255 OR LEN(GuestOrganization) > 255");
    expect(text).toContain("<> (SELECT COUNT(*) FROM @Wanted WHERE StakeholderId IS NOT NULL)");
    expect(flat).toContain(
      "INSERT INTO app.MeetingParticipant ([MeetingId], [StakeholderId], [IsApology], CreatedBy) SELECT @MeetingId, w.StakeholderId, w.IsApology, @ActorUserId FROM @Wanted AS w WHERE w.StakeholderId IS NOT NULL",
    );
    expect(flat).toContain(
      "INSERT INTO app.MeetingParticipant ([MeetingId], [StakeholderId], GuestName, GuestOrganization, [IsApology], CreatedBy) SELECT @MeetingId, NULL, w.GuestName, w.GuestOrganization, w.IsApology, @ActorUserId FROM @Wanted AS w WHERE w.GuestName IS NOT NULL",
    );
    expect(flat).toContain(
      "AND mp.StakeholderId IS NULL AND NOT EXISTS (SELECT 1 FROM @Wanted AS w WHERE w.GuestName = mp.GuestName)",
    );
  });

  it("lists the meeting's guests in the roster, with the live stakeholders", () => {
    const roster = sql("usp_Meeting_GetRoster");
    expect(roster).toContain(
      "WHERE mp.MeetingId = @MeetingId AND mp.IsDeleted = 0 AND mp.StakeholderId IS NULL",
    );
    expect(roster).toContain("r.GuestName, r.GuestOrganization");
  });

  it("keeps one identity per participant row and one live row per guest name (migration 033)", () => {
    const migration = readFileSync("db/migrations/033_meeting_guest_participants.sql", "utf8");
    const flat = migration.replace(/\s+/g, " ");
    expect(flat).toContain(
      "ALTER TABLE app.MeetingParticipant ALTER COLUMN StakeholderId INT NULL",
    );
    expect(flat).toContain(
      "WHERE IsDeleted = 0 AND MeetingId IS NOT NULL AND StakeholderId IS NOT NULL",
    );
    expect(flat).toContain("ON app.MeetingParticipant (MeetingId, GuestName)");
    expect(flat).toContain(
      "WHERE IsDeleted = 0 AND MeetingId IS NOT NULL AND GuestName IS NOT NULL",
    );
    expect(flat).toContain(
      "CK_MeetingParticipant_Person CHECK ( (StakeholderId IS NOT NULL AND GuestName IS NULL AND GuestOrganization IS NULL) OR (StakeholderId IS NULL AND GuestName IS NOT NULL AND LEN(GuestName) > 0))",
    );
  });

  it("checks the order against the live siblings, read under a lock, after taking the meeting lock", () => {
    for (const [name, table] of [
      ["usp_MeetingAgendaItem_Reorder", "app.MeetingAgendaItem"],
      ["usp_MeetingDiscussionPoint_Reorder", "app.MeetingDiscussionPoint"],
      ["usp_MeetingActionItem_Reorder", "app.MeetingActionItem"],
    ]) {
      const text = sql(name);
      const lock = text.indexOf(LOCK);
      const siblings = text.indexOf(`FROM ${table} WITH (UPDLOCK, HOLDLOCK)`);
      const conflict = text.indexOf("THROW 50002, N'CONFLICT:");
      expect(lock, name).toBeGreaterThan(text.indexOf("BEGIN TRAN"));
      expect(siblings, name).toBeGreaterThan(lock);
      expect(conflict, name).toBeGreaterThan(siblings);
      // The check, the audit's before-image and the UPDATE all use that one locked snapshot.
      expect(text.slice(siblings).match(/FROM app\.\w+\b(?! WITH)/g), name).toEqual([
        `FROM ${table}`,
      ]);
    }
  });

  it("validates a stakeholder under a lock inside the transaction, so a delete cannot slip in between", () => {
    const check = /\b(FROM|JOIN) app\.Stakeholder AS s WITH \(UPDLOCK, HOLDLOCK\)/;
    for (const name of [
      "usp_MeetingParticipant_Set",
      "usp_MeetingParticipant_Create",
      "usp_MeetingActionItem_Create",
      "usp_MeetingActionItem_Update",
    ]) {
      const text = sql(name);
      const tran = text.indexOf("BEGIN TRAN");
      const locked = text.search(check);
      expect(locked, name).toBeGreaterThan(tran);
      expect(text.indexOf("THROW 50004, N'VALIDATION:", locked), name).toBeGreaterThan(locked);
      // No stakeholder read before the transaction decides anything.
      expect(text.slice(0, tran), name).not.toMatch(/\b(FROM|JOIN) app\.Stakeholder\b/);
    }
  });

  it("answers null, not an empty name, for an action nobody is responsible for", () => {
    const named = [...PROCS].filter(([, text]) => /AS AssigneeName\b/.test(text)).map(([n]) => n);
    expect(named.sort()).toEqual(
      [
        "usp_Meeting_GetWorkspace",
        "usp_MeetingActionItem_Create",
        "usp_MeetingActionItem_GetById",
        "usp_MeetingActionItem_List",
        "usp_MeetingActionItem_Update",
      ].sort(),
    );
    for (const name of named) {
      expect(sql(name), name).toContain(
        "NULLIF(TRIM(CONCAT(s.FirstName, N' ', s.LastName)), N'') AS AssigneeName",
      );
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
      "REPLACE(REPLACE(REPLACE(REPLACE(@Search, N'\\', N'\\\\'), N'%', N'\\%'), N'_', N'\\_'), N'[', N'\\[')",
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

  it("builds the roster from the meeting's own project, stamp first, every participant, the rest within Set's limit", () => {
    const roster = sql("usp_Meeting_GetRoster");
    expect(roster).toContain("WHERE s.ProjectId = @RowProjectId AND s.IsDeleted = 0");
    expect(roster).toContain("AND live.ProjectId = @RowProjectId AND live.IsDeleted = 0");
    const stamp = roster.indexOf("DECLARE @ParticipantsStamp");
    expect(stamp).toBeGreaterThan(roster.indexOf("usp_Project_AssertAccess"));
    expect(stamp).toBeLessThan(roster.indexOf("FROM app.Stakeholder"));
    expect(roster).toContain(
      `WHERE r.MeetingParticipantId IS NOT NULL OR r.Pick <= ${MEETING_PARTICIPANTS_MAX}`,
    );
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
