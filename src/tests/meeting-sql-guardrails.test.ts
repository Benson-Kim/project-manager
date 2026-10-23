import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ACTION_STATUSES, ON_HOLD_REASON_MAX } from "@/modules/meetings/schemas/meeting";
import {
  MEETING_CARRY_OVER_MAX,
  MEETING_PARTICIPANTS_MAX,
  MEETING_REORDER_MAX,
} from "@/modules/meetings/schemas/meeting-form";

const FOLDERS = [
  "meeting",
  "meeting-agenda-item",
  "meeting-discussion-point",
  "meeting-action-item",
  "meeting-action-followup",
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
    expect(PROCS.size).toBe(39);
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
      "usp_MeetingActionFollowUp_Create",
      "usp_MeetingActionFollowUp_Delete",
      "usp_MeetingActionFollowUp_Reorder",
      "usp_MeetingParticipant_Create",
      "usp_MeetingParticipant_Update",
      "usp_MeetingParticipant_Delete",
      "usp_MeetingParticipant_Set",
    ];
    for (const name of locking) expect(afterBeginTran(name, LOCK), name).toBe(true);
  });

  it("checks RowVer inside the transaction on every update and delete", () => {
    const writes = [...PROCS.keys()].filter((n) => /_(Update|Delete|SetStatus)$/.test(n));
    expect(writes).toHaveLength(13);
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
      ["usp_MeetingActionFollowUp_Reorder", "app.MeetingActionFollowUp"],
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
      "usp_MeetingActionFollowUp_Create",
      "usp_MeetingActionFollowUp_Update",
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
      "usp_MeetingActionItem_SetStatus",
      "usp_MeetingActionFollowUp_Update",
      "usp_MeetingParticipant_Update",
    ]) {
      expect(paramsOf(name), name).not.toMatch(
        /@(MeetingId|AgendaItemId|DiscussionPointId|StakeholderId|ProjectId)\b/,
      );
    }
    // A follow-up's parent is its action item, so that is the id its edits must not take.
    for (const name of ["usp_MeetingActionFollowUp_Update", "usp_MeetingActionFollowUp_Delete"]) {
      expect(paramsOf(name), name).not.toMatch(/@MeetingActionItemId\b/);
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
      "usp_MeetingActionFollowUp_Reorder",
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
    expect(workspace.match(/FOR JSON PATH, INCLUDE_NULL_VALUES\) AS \w+Json/g)).toHaveLength(6);
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

  // ── An action's status and its follow-ups (ADR-0043) ──────────────────────

  it("holds the same three statuses in SQL as in TypeScript", () => {
    const list = ACTION_STATUSES.map((v) => `'${v}'`).join(", ");
    const migration = readFileSync("db/migrations/040_meeting_action_followup.sql", "utf8");
    expect(migration.replace(/\s+/g, " ")).toContain(
      `CK_MeetingActionItem_Status CHECK ([Status] IN (${list}))`,
    );
    // Every proc that takes a status re-checks the set, so a VALIDATION beats a
    // constraint violation the app cannot map (ADR-0012).
    for (const name of [
      "usp_MeetingActionItem_Create",
      "usp_MeetingActionItem_Update",
      "usp_MeetingActionItem_SetStatus",
    ]) {
      expect(sql(name), name).toContain(`@Status NOT IN (${list})`);
      expect(sql(name), name).toContain("THROW 50004, N'VALIDATION:Status must be");
    }
  });

  it("writes the status everywhere an action is written, and reads it everywhere one is read", () => {
    for (const name of ["usp_MeetingActionItem_Create", "usp_MeetingActionItem_Update"]) {
      expect(paramsOf(name), name).toMatch(/@Status\s+VARCHAR\(12\)\s+= 'in-progress'/);
    }
    // Every proc that answers an action row answers its status too.
    for (const name of [
      "usp_MeetingActionItem_Create",
      "usp_MeetingActionItem_Update",
      "usp_MeetingActionItem_GetById",
      "usp_MeetingActionItem_List",
    ]) {
      expect(sql(name), name).toContain("ai.[Status],");
    }
    expect(sql("usp_Meeting_GetWorkspace")).toContain("ai.[Status],");
  });

  // ── Why an action is on hold (ADR-0044) ───────────────────────────────────

  it("lets only an action on hold carry a reason, in the table and in every proc", () => {
    const migration = readFileSync(
      "db/migrations/041_meeting_action_on_hold_reason.sql",
      "utf8",
    ).replace(/\s+/g, " ");
    // A CHECK naming a second column has to be table-level, or the apply dies on
    // Msg 8141 (src/tests/migration-check-constraints.test.ts reads the shape).
    expect(migration).toContain(
      "ADD CONSTRAINT CK_MeetingActionItem_OnHoldReason CHECK ([OnHoldReason] IS NULL OR [Status] = 'on-hold')",
    );
    expect(migration).toContain(`ADD [OnHoldReason] NVARCHAR(${ON_HOLD_REASON_MAX}) NULL`);

    for (const name of [
      "usp_MeetingActionItem_Create",
      "usp_MeetingActionItem_Update",
      "usp_MeetingActionItem_SetStatus",
    ]) {
      // The same column width as the table, and the pair the table forbids is
      // refused rather than quietly dropped, so a caller that broke the rule shows.
      expect(paramsOf(name), name).toMatch(
        new RegExp(`@OnHoldReason\\s+NVARCHAR\\(${ON_HOLD_REASON_MAX}\\)\\s+= NULL`),
      );
      expect(sql(name), name).toContain("SET @OnHoldReason = NULLIF(TRIM(@OnHoldReason), N'');");
      expect(sql(name), name).toContain("IF @OnHoldReason IS NOT NULL AND @Status <> 'on-hold'");
      expect(sql(name), name).toContain("THROW 50004, N'VALIDATION:A reason belongs to");
      // It is checked before the transaction opens, as the status is.
      expect(sql(name).indexOf("@OnHoldReason IS NOT NULL"), name).toBeLessThan(
        sql(name).indexOf("BEGIN TRAN"),
      );
    }

    // The write carries the reason, so moving a status on clears what was there.
    for (const name of ["usp_MeetingActionItem_Update", "usp_MeetingActionItem_SetStatus"]) {
      expect(sql(name), name).toMatch(/\[OnHoldReason\]\s+= @OnHoldReason,/);
    }
    const create = sql("usp_MeetingActionItem_Create");
    const insert = create.slice(create.indexOf("INSERT INTO app.MeetingActionItem"));
    expect(insert).toContain("[OnHoldReason]");
    expect(insert).toContain("@OnHoldReason");
  });

  it("answers the reason wherever it answers the status", () => {
    for (const name of [
      "usp_MeetingActionItem_Create",
      "usp_MeetingActionItem_Update",
      "usp_MeetingActionItem_GetById",
      "usp_MeetingActionItem_List",
    ]) {
      expect(sql(name), name).toContain("ai.[OnHoldReason],");
    }
    // Both sets of the workspace read: the meeting's own actions and the ones
    // carried over from its project's earlier meetings.
    const workspace = sql("usp_Meeting_GetWorkspace");
    expect(workspace.match(/ai\.\[OnHoldReason\]/g)).toHaveLength(2);
  });

  it("keeps the reason in the audit trail, which is where a cleared one survives", () => {
    for (const name of [
      "usp_MeetingActionItem_Create",
      "usp_MeetingActionItem_Update",
      "usp_MeetingActionItem_SetStatus",
    ]) {
      const audit = sql(name).slice(sql(name).indexOf("INSERT INTO audit.AuditLog"));
      expect(audit, name).toContain("[OnHoldReason]");
    }
    // SetStatus's BeforeJson is the only record of a reason the hold just lost.
    const set = sql("usp_MeetingActionItem_SetStatus");
    expect(set.slice(set.indexOf("DECLARE @Before"))).toContain("[OnHoldReason]");
  });

  it("carries an action over only within its project, from earlier meetings, within the cap", () => {
    const workspace = sql("usp_Meeting_GetWorkspace");
    const carry = workspace.slice(workspace.indexOf("AS CarriedOverJson") - 2000);
    expect(workspace).toContain(`DECLARE @CarryOverMax INT = ${MEETING_CARRY_OVER_MAX};`);
    expect(carry).toContain("SELECT TOP (@CarryOverMax)");
    expect(carry).toContain("src.ProjectId = m.ProjectId");
    expect(carry).toContain("src.MeetingId <> m.MeetingId");
    expect(carry).toContain("ai.[Status] <> 'completed'");
    // Only live rows of live meetings, and only ones strictly earlier.
    expect(carry).toContain("src.IsDeleted = 0");
    expect(carry).toContain(
      "ISNULL(CAST(src.StartDate AS DATE), @Undated) < ISNULL(CAST(m.StartDate AS DATE), @Undated)",
    );
    expect(carry).toContain("src.MeetingId < m.MeetingId");
  });

  it("deletes an action's follow-ups with its action, point, agenda item and meeting", () => {
    for (const name of [
      "usp_MeetingActionItem_Delete",
      "usp_MeetingDiscussionPoint_Delete",
      "usp_MeetingAgendaItem_Delete",
      "usp_Meeting_Delete",
    ]) {
      const text = sql(name);
      expect(text, name).toContain("UPDATE app.MeetingActionFollowUp SET");
      // The sweep is inside the transaction and names the follow-ups it removed.
      expect(afterBeginTran(name, "UPDATE app.MeetingActionFollowUp SET"), name).toBe(true);
      expect(text, name).toContain("ActionFollowUps");
      // It reads the removed actions from a table it is not also writing through
      // OUTPUT INTO, which is what @Actions is for in the two multi-level deletes.
      const sweep = text.slice(text.indexOf("UPDATE app.MeetingActionFollowUp SET"));
      const source = /MeetingActionItemId (IN \(SELECT Id FROM @\w+\)|= @MeetingActionItemId)/.exec(
        sweep,
      );
      expect(source, name).not.toBeNull();
      if (source?.[1]?.startsWith("IN")) {
        const table = /@(\w+)\)/.exec(source[1])![1];
        expect(
          sweep.slice(0, sweep.indexOf("WHERE")),
          `${name} writes into the @${table} it reads`,
        ).not.toMatch(new RegExp(`INTO @${table}\\b`));
      }
    }
  });

  it("gives a follow-up its own RowVer conflict, and never a status of its own", () => {
    for (const name of ["usp_MeetingActionFollowUp_Update", "usp_MeetingActionFollowUp_Delete"]) {
      expect(sql(name), name).toContain(
        "THROW 50002, N'CONFLICT:MeetingActionFollowUp was modified by someone else'",
      );
    }
    // One status per action, on the action: a follow-up carrying one would be a
    // second place to look for whether the action is done.
    for (const [name, text] of PROCS) {
      if (!name.startsWith("usp_MeetingActionFollowUp_")) continue;
      expect(text, name).not.toMatch(/fu\.\[?Status\]?/);
    }
    const migration = readFileSync("db/migrations/040_meeting_action_followup.sql", "utf8");
    const table = migration.slice(migration.indexOf("CREATE TABLE app.MeetingActionFollowUp"));
    expect(table.slice(0, table.indexOf(");"))).not.toContain("Status");
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
