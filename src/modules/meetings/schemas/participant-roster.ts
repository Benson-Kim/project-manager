import type { RosterEntry, WorkspaceParticipant } from "./meeting";
import type { SetParticipantsValues } from "./meeting-form";

/**
 * The participant panel's state (checklist rows 13 and 54): one choice per
 * person out of Not invited / Attended / Apology. The panel keeps only the
 * choices the user made over what the roster read; rows kept for history
 * never change, because usp_MeetingParticipant_Set leaves them alone.
 *
 * A person is a stakeholder of the project, keyed by id, or a guest, keyed by
 * name (case-insensitively, as the database keys guests within a meeting). A
 * guest exists only as a participant row: typed into the panel they are an
 * unsaved entry until Save stores them, and Not invited removes them.
 */

export const ATTENDANCE = ["none", "attended", "apology"] as const;
export type Attendance = (typeof ATTENDANCE)[number];

export type Choices = ReadonlyMap<string, Attendance>;

type Person = Pick<RosterEntry, "StakeholderId" | "GuestName">;

export const guestKey = (name: string) => `guest:${name.trim().toLocaleLowerCase()}`;

export function personKey(person: Person): string {
  return person.StakeholderId === null
    ? guestKey(person.GuestName ?? "")
    : `stakeholder:${person.StakeholderId}`;
}

export const isGuest = (person: Person) => person.StakeholderId === null;

/** "Name - Organization", as the procs label a guest. */
export function guestLabel(name: string, organization: string | null): string {
  return organization ? `${name} - ${organization}` : name;
}

export type GuestProblem = "empty" | "long" | "listed";

/** Why a guest cannot be added as typed, or null. */
export function guestProblem(
  entries: readonly RosterEntry[],
  name: string,
  organization: string,
): GuestProblem | null {
  const trimmed = name.trim();
  if (!trimmed) return "empty";
  if (trimmed.length > 255 || organization.trim().length > 255) return "long";
  if (entries.some((entry) => personKey(entry) === guestKey(trimmed))) return "listed";
  return null;
}

/** A guest typed into the panel: an entry without a row yet. */
export function guestEntry(name: string, organization: string): RosterEntry {
  const guestName = name.trim();
  const guestOrganization = organization.trim() || null;
  return {
    StakeholderId: null,
    GuestName: guestName,
    GuestOrganization: guestOrganization,
    Label: guestLabel(guestName, guestOrganization),
    MeetingParticipantId: null,
    IsApology: null,
    IsHistorical: false,
  };
}

/** What the roster read for this person. */
export function savedAttendance(entry: RosterEntry): Attendance {
  if (entry.IsApology == null) return "none";
  return entry.IsApology ? "apology" : "attended";
}

export function attendanceOf(entry: RosterEntry, choices: Choices): Attendance {
  if (entry.IsHistorical) return savedAttendance(entry);
  return choices.get(personKey(entry)) ?? savedAttendance(entry);
}

/** Records a choice; choosing what was read again drops it, so nothing is left to save. */
export function choose(
  choices: Choices,
  entry: RosterEntry,
  attendance: Attendance,
): Map<string, Attendance> {
  const next = new Map(choices);
  if (entry.IsHistorical || attendance === savedAttendance(entry)) {
    next.delete(personKey(entry));
  } else {
    next.set(personKey(entry), attendance);
  }
  return next;
}

export function hasChanges(entries: readonly RosterEntry[], choices: Choices): boolean {
  return entries.some((entry) => {
    if (entry.IsHistorical) return false;
    const choice = choices.get(personKey(entry));
    return choice !== undefined && choice !== savedAttendance(entry);
  });
}

/** Set's list: every live stakeholder and every guest who attended or sent apologies. */
export function participantsPayload(
  entries: readonly RosterEntry[],
  choices: Choices,
): SetParticipantsValues["participants"] {
  return entries.flatMap((entry): SetParticipantsValues["participants"] => {
    if (entry.IsHistorical) return [];
    const attendance = attendanceOf(entry, choices);
    if (attendance === "none") return [];
    const isApology = attendance === "apology";
    return entry.StakeholderId === null
      ? [
          {
            guestName: entry.GuestName ?? "",
            guestOrganization: entry.GuestOrganization,
            isApology,
          },
        ]
      : [{ stakeholderId: entry.StakeholderId, isApology }];
  });
}

/** Counts every participant, those kept for history included, like the meetings list. */
export function attendanceCounts(
  entries: readonly RosterEntry[],
  choices: Choices,
): { attended: number; apologies: number } {
  let attended = 0;
  let apologies = 0;
  for (const entry of entries) {
    const attendance = attendanceOf(entry, choices);
    if (attendance === "attended") attended += 1;
    else if (attendance === "apology") apologies += 1;
  }
  return { attended, apologies };
}

function entryOf(participant: WorkspaceParticipant, known: RosterEntry | null): RosterEntry {
  return {
    StakeholderId: participant.StakeholderId,
    GuestName: participant.GuestName,
    GuestOrganization: participant.GuestOrganization,
    Label: known && !isGuest(participant) ? known.Label : participant.Label,
    MeetingParticipantId: participant.MeetingParticipantId,
    IsApology: participant.IsApology,
    IsHistorical: known?.IsHistorical ?? false,
  };
}

/**
 * The roster once a save went through, from the participants the workspace
 * re-read, so the panel shows what was stored before the page refreshes. A
 * guest without a row any more is gone; a stored guest the panel did not list
 * is added.
 */
export function rosterAfterSave(
  entries: readonly RosterEntry[],
  participants: readonly WorkspaceParticipant[],
): RosterEntry[] {
  const stored = new Map(participants.map((p) => [personKey(p), p]));
  const next: RosterEntry[] = [];
  for (const entry of entries) {
    if (entry.IsHistorical) {
      next.push(entry);
      continue;
    }
    const key = personKey(entry);
    const participant = stored.get(key);
    stored.delete(key);
    if (participant) next.push(entryOf(participant, entry));
    else if (!isGuest(entry)) next.push({ ...entry, MeetingParticipantId: null, IsApology: null });
  }
  for (const participant of stored.values()) {
    if (isGuest(participant)) next.push(entryOf(participant, null));
  }
  return next;
}

/**
 * The choices still unsaved once a save went through: those made after the
 * save was sent (a pick during a slow save must not vanish), read against what
 * the save stored. A pick that now matches the stored state has nothing left
 * to save; a guest typed in meanwhile still has.
 */
export function choicesAfterSave(
  before: readonly RosterEntry[],
  after: readonly RosterEntry[],
  sent: Choices,
  current: Choices,
): Map<string, Attendance> {
  const stored = new Map(after.map((entry) => [personKey(entry), entry]));
  const next = new Map<string, Attendance>();
  const seen = new Set<string>();
  for (const entry of before) {
    if (entry.IsHistorical) continue;
    const key = personKey(entry);
    seen.add(key);
    const wanted = attendanceOf(entry, current);
    if (wanted === attendanceOf(entry, sent)) continue;
    const now = stored.get(key);
    const unsaved = now ? !now.IsHistorical && wanted !== savedAttendance(now) : wanted !== "none";
    if (unsaved) next.set(key, wanted);
  }
  for (const [key, wanted] of current) {
    if (seen.has(key) || stored.has(key) || wanted === "none") continue;
    next.set(key, wanted);
  }
  return next;
}

const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase();

/** People whose label contains the search, ignoring case and accents. */
export function filterRoster(entries: readonly RosterEntry[], query: string): RosterEntry[] {
  const needle = fold(query.trim());
  if (!needle) return [...entries];
  return entries.filter((entry) => fold(entry.Label).includes(needle));
}
