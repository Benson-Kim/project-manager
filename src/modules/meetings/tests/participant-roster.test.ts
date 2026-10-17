import { describe, expect, it } from "vitest";
import type { RosterEntry, WorkspaceParticipant } from "../schemas/meeting";
import { setParticipantsSchema } from "../schemas/meeting-form";
import {
  attendanceCounts,
  attendanceOf,
  choicesAfterSave,
  choose,
  filterRoster,
  guestEntry,
  guestLabel,
  guestProblem,
  hasChanges,
  isGuest,
  participantsPayload,
  personKey,
  rosterAfterSave,
  savedAttendance,
  type Choices,
} from "../schemas/participant-roster";

function person(id: number, overrides: Partial<RosterEntry> = {}): RosterEntry {
  return {
    StakeholderId: id,
    Label: `Person ${id}`,
    MeetingParticipantId: null,
    IsApology: null,
    IsHistorical: false,
    GuestName: null,
    GuestOrganization: null,
    ...overrides,
  };
}

const gary = person(1, {
  Label: "Gary Cantrall - Developer, Organization and efficiency",
  MeetingParticipantId: 10,
  IsApology: false,
});
const lucy = person(2, { Label: "Lucy Taylor - Cloud Architect, High Cloud Services" });
const tome = person(3, { Label: "Tome Green", MeetingParticipantId: 11, IsApology: true });
const gone = person(4, {
  Label: "Hélène Côté",
  MeetingParticipantId: 12,
  IsApology: false,
  IsHistorical: true,
});
const roster = [gary, lucy, tome, gone];
const none: Choices = new Map();
const key = personKey;

const participant = (stakeholderId: number, isApology: boolean): WorkspaceParticipant => ({
  MeetingParticipantId: 100 + stakeholderId,
  StakeholderId: stakeholderId,
  Label: `Person ${stakeholderId}`,
  IsApology: isApology,
  StakeholderIsDeleted: false,
  GuestName: null,
  GuestOrganization: null,
  RowVer: 3000,
});

const guest = (
  id: number,
  name: string,
  organization: string | null,
  isApology: boolean,
): WorkspaceParticipant => ({
  MeetingParticipantId: 100 + id,
  StakeholderId: null,
  Label: guestLabel(name, organization),
  IsApology: isApology,
  StakeholderIsDeleted: false,
  GuestName: name,
  GuestOrganization: organization,
  RowVer: 3000,
});

describe("participant roster: state", () => {
  it("reads each person's saved state", () => {
    expect(roster.map(savedAttendance)).toEqual(["attended", "none", "apology", "attended"]);
    expect(roster.map((e) => attendanceOf(e, none))).toEqual([
      "attended",
      "none",
      "apology",
      "attended",
    ]);
  });

  it("keys a stakeholder by id and a guest by name, ignoring case and outer spaces", () => {
    expect(key(gary)).toBe("stakeholder:1");
    expect(key(guestEntry(" Ada Lovelace ", ""))).toBe(key(guestEntry("ada lovelace", "Other")));
    expect(key(guestEntry("Ada", ""))).not.toBe(key(guestEntry("Adá", "")));
    expect(isGuest(gary)).toBe(false);
    expect(isGuest(guestEntry("Ada", ""))).toBe(true);
  });

  it("a choice overrides the saved state; choosing it back leaves nothing to save", () => {
    let choices = choose(none, lucy, "apology");
    expect(attendanceOf(lucy, choices)).toBe("apology");
    expect(hasChanges(roster, choices)).toBe(true);
    choices = choose(choices, lucy, "none");
    expect(choices.size).toBe(0);
    expect(hasChanges(roster, choices)).toBe(false);
  });

  it("never changes a row kept for history", () => {
    const choices = choose(none, gone, "none");
    expect(choices.size).toBe(0);
    expect(attendanceOf(gone, new Map([[key(gone), "none"]]))).toBe("attended");
    expect(hasChanges(roster, new Map([[key(gone), "none"]]))).toBe(false);
  });

  it("does not mutate the choices it was given", () => {
    const before = new Map([[key(lucy), "attended" as const]]);
    choose(before, gary, "apology");
    expect([...before]).toEqual([[key(lucy), "attended"]]);
  });
});

describe("participant roster: guests", () => {
  it("builds an unsaved guest entry, trimmed and labelled like the procs", () => {
    expect(guestEntry("  Ada Lovelace ", " Analytical Engines ")).toEqual({
      StakeholderId: null,
      GuestName: "Ada Lovelace",
      GuestOrganization: "Analytical Engines",
      Label: "Ada Lovelace - Analytical Engines",
      MeetingParticipantId: null,
      IsApology: null,
      IsHistorical: false,
    });
    expect(guestEntry("Ada", "  ").Label).toBe("Ada");
  });

  it("refuses an empty, overlong or already listed name, ignoring case", () => {
    expect(guestProblem(roster, "  ", "")).toBe("empty");
    expect(guestProblem(roster, "x".repeat(256), "")).toBe("long");
    expect(guestProblem(roster, "Ada", "y".repeat(256))).toBe("long");
    const listed = [...roster, guestEntry("Ada Lovelace", "")];
    expect(guestProblem(listed, " ada lovelace", "Other")).toBe("listed");
    expect(guestProblem(listed, "Gary Cantrall", "")).toBeNull();
    expect(guestProblem(roster, "Ada Lovelace", "")).toBeNull();
  });

  it("is sent by name and organization among the stakeholders, and counted", () => {
    const ada = guestEntry("Ada Lovelace", "Analytical Engines");
    const all = [...roster, ada];
    const choices = choose(none, ada, "attended");
    expect(hasChanges(all, choices)).toBe(true);
    const payload = participantsPayload(all, choices);
    expect(payload).toEqual([
      { stakeholderId: 1, isApology: false },
      { stakeholderId: 3, isApology: true },
      { guestName: "Ada Lovelace", guestOrganization: "Analytical Engines", isApology: false },
    ]);
    expect(attendanceCounts(all, choices)).toEqual({ attended: 3, apologies: 1 });
    expect(
      setParticipantsSchema.safeParse({ meetingId: 2, stamp: 2004, participants: payload }).success,
    ).toBe(true);
  });
});

describe("participant roster: save payload", () => {
  it("lists every live attendee and apology, and leaves out the not invited and history", () => {
    const choices = choose(choose(none, lucy, "attended"), tome, "none");
    expect(participantsPayload(roster, choices)).toEqual([
      { stakeholderId: 1, isApology: false },
      { stakeholderId: 2, isApology: false },
    ]);
  });

  it("an empty list uninvites everyone", () => {
    const choices = choose(choose(none, gary, "none"), tome, "none");
    expect(participantsPayload(roster, choices)).toEqual([]);
  });

  it("is what the Set action accepts", () => {
    const payload = participantsPayload(roster, choose(none, lucy, "apology"));
    const parsed = setParticipantsSchema.safeParse({
      meetingId: 2,
      stamp: 2004,
      participants: payload,
    });
    expect(parsed.success).toBe(true);
  });
});

describe("participant roster: counts", () => {
  it("counts attendees and apologies, history included, like the list", () => {
    expect(attendanceCounts(roster, none)).toEqual({ attended: 2, apologies: 1 });
    const choices = choose(choose(none, lucy, "apology"), gary, "none");
    expect(attendanceCounts(roster, choices)).toEqual({ attended: 1, apologies: 2 });
    expect(attendanceCounts([], none)).toEqual({ attended: 0, apologies: 0 });
  });
});

describe("participant roster: search", () => {
  it("matches any part of the label, ignoring case and accents", () => {
    expect(filterRoster(roster, "cloud").map((e) => e.StakeholderId)).toEqual([2]);
    expect(filterRoster(roster, "  DEVELOPER ").map((e) => e.StakeholderId)).toEqual([1]);
    expect(filterRoster(roster, "helene cote").map((e) => e.StakeholderId)).toEqual([4]);
    expect(filterRoster(roster, "Côté").map((e) => e.StakeholderId)).toEqual([4]);
  });

  it("shows everyone for an empty search and no one for a miss", () => {
    expect(filterRoster(roster, "   ")).toEqual(roster);
    expect(filterRoster(roster, "zzz")).toEqual([]);
  });

  it("treats the search as text, not a pattern", () => {
    expect(filterRoster(roster, ".*")).toEqual([]);
    expect(filterRoster([person(5, { Label: "A (B)" })], "(b)")).toHaveLength(1);
  });
});

describe("participant roster: after a save", () => {
  it("takes each live person's state from the re-read participants", () => {
    const after = rosterAfterSave(roster, [participant(2, true), participant(3, false)]);
    expect(after.map((e) => [e.StakeholderId, e.MeetingParticipantId, e.IsApology])).toEqual([
      [1, null, null],
      [2, 102, true],
      [3, 103, false],
      [4, 12, false],
    ]);
    expect(hasChanges(after, none)).toBe(false);
  });

  it("keeps a stored guest with the row's label, drops one without a row, adds one the panel missed", () => {
    const ada = guestEntry("Ada Lovelace", "Analytical Engines");
    const bob = guestEntry("Bob", "");
    const after = rosterAfterSave(
      [...roster, ada, bob],
      [
        participant(1, false),
        guest(7, "Ada Lovelace", "Analytical Engines Ltd", false),
        guest(9, "Zed", null, true),
      ],
    );
    expect(
      after.map((e) => [
        e.StakeholderId,
        e.GuestName,
        e.MeetingParticipantId,
        e.IsApology,
        e.Label,
      ]),
    ).toEqual([
      [1, null, 101, false, gary.Label],
      [2, null, null, null, lucy.Label],
      [3, null, null, null, tome.Label],
      [4, null, 12, false, gone.Label],
      [null, "Ada Lovelace", 107, false, "Ada Lovelace - Analytical Engines Ltd"],
      [null, "Zed", 109, true, "Zed"],
    ]);
    expect(hasChanges(after, none)).toBe(false);
  });

  it("keeps the picks made while the save was in flight, and drops the ones the save stored", () => {
    const sent = choose(none, lucy, "attended");
    const after = rosterAfterSave(roster, [
      participant(1, false),
      participant(2, false),
      participant(3, true),
    ]);
    // Meanwhile: Tome switched to attended, Gary uninvited, Lucy's pick left alone.
    const current = choose(choose(sent, tome, "attended"), gary, "none");
    const kept = choicesAfterSave(roster, after, sent, current);
    expect([...kept]).toEqual([
      [key(gary), "none"],
      [key(tome), "attended"],
    ]);
    expect(hasChanges(after, kept)).toBe(true);
    // Lucy and Tome as picked, Gary uninvited, the historical row still counted.
    expect(attendanceCounts(after, kept)).toEqual({ attended: 3, apologies: 0 });
  });

  it("keeps a pick that went back to the state the save overwrote", () => {
    const sent = choose(none, lucy, "attended");
    const after = rosterAfterSave(roster, [
      participant(1, false),
      participant(2, false),
      participant(3, true),
    ]);
    const current = choose(sent, lucy, "none");
    expect([...choicesAfterSave(roster, after, sent, current)]).toEqual([[key(lucy), "none"]]);
  });

  it("has nothing left when nothing changed during the save, or the change matches what was stored", () => {
    const sent = choose(none, lucy, "attended");
    const after = rosterAfterSave(roster, [
      participant(1, false),
      participant(2, false),
      participant(3, true),
    ]);
    expect(choicesAfterSave(roster, after, sent, sent).size).toBe(0);
    const current = choose(sent, gary, "attended");
    expect(choicesAfterSave(roster, after, sent, current).size).toBe(0);
  });

  it("never carries a choice over a row kept for history", () => {
    const current: Choices = new Map([[key(gone), "none"]]);
    expect(choicesAfterSave(roster, roster, none, current).size).toBe(0);
  });

  it("keeps a guest typed in while the save ran", () => {
    const sent = choose(none, lucy, "attended");
    const after = rosterAfterSave(roster, [participant(2, false)]);
    const ada = guestEntry("Ada", "");
    const current = choose(sent, ada, "apology");
    expect([...choicesAfterSave(roster, after, sent, current)]).toEqual([[key(ada), "apology"]]);
  });
});
