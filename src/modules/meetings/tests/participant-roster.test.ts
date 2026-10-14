import { describe, expect, it } from "vitest";
import type { RosterEntry, WorkspaceParticipant } from "../schemas/meeting";
import { setParticipantsSchema } from "../schemas/meeting-form";
import {
  attendanceCounts,
  attendanceOf,
  choose,
  filterRoster,
  hasChanges,
  participantsPayload,
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
    expect(attendanceOf(gone, new Map([[4, "none"]]))).toBe("attended");
    expect(hasChanges(roster, new Map([[4, "none"]]))).toBe(false);
  });

  it("does not mutate the choices it was given", () => {
    const before = new Map([[2, "attended" as const]]);
    choose(before, gary, "apology");
    expect([...before]).toEqual([[2, "attended"]]);
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
  const participant = (stakeholderId: number, isApology: boolean): WorkspaceParticipant => ({
    MeetingParticipantId: 100 + stakeholderId,
    StakeholderId: stakeholderId,
    Label: `Person ${stakeholderId}`,
    IsApology: isApology,
    StakeholderIsDeleted: false,
    RowVer: 3000,
  });

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
});
