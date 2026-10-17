import type { RosterEntry, WorkspaceParticipant } from "./meeting";
import type { SetParticipantsValues } from "./meeting-form";

/**
 * The participant panel's state (checklist rows 13 and 54): one choice per
 * person out of Not invited / Attended / Apology. The panel keeps only the
 * choices the user made over what the roster read; rows kept for history
 * never change, because usp_MeetingParticipant_Set leaves them alone.
 */

export const ATTENDANCE = ["none", "attended", "apology"] as const;
export type Attendance = (typeof ATTENDANCE)[number];

export type Choices = ReadonlyMap<number, Attendance>;

/** What the roster read for this person. */
export function savedAttendance(entry: RosterEntry): Attendance {
  if (entry.IsApology == null) return "none";
  return entry.IsApology ? "apology" : "attended";
}

export function attendanceOf(entry: RosterEntry, choices: Choices): Attendance {
  if (entry.IsHistorical) return savedAttendance(entry);
  return choices.get(entry.StakeholderId) ?? savedAttendance(entry);
}

/** Records a choice; choosing what was read again drops it, so nothing is left to save. */
export function choose(
  choices: Choices,
  entry: RosterEntry,
  attendance: Attendance,
): Map<number, Attendance> {
  const next = new Map(choices);
  if (entry.IsHistorical || attendance === savedAttendance(entry)) {
    next.delete(entry.StakeholderId);
  } else {
    next.set(entry.StakeholderId, attendance);
  }
  return next;
}

export function hasChanges(entries: readonly RosterEntry[], choices: Choices): boolean {
  return entries.some(
    (entry) =>
      !entry.IsHistorical &&
      choices.has(entry.StakeholderId) &&
      choices.get(entry.StakeholderId) !== savedAttendance(entry),
  );
}

/** Set's list: every live stakeholder who attended or sent apologies. */
export function participantsPayload(
  entries: readonly RosterEntry[],
  choices: Choices,
): SetParticipantsValues["participants"] {
  return entries.flatMap((entry) => {
    if (entry.IsHistorical) return [];
    const attendance = attendanceOf(entry, choices);
    return attendance === "none"
      ? []
      : [{ stakeholderId: entry.StakeholderId, isApology: attendance === "apology" }];
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

/**
 * The roster once a save went through, from the participants the workspace
 * re-read, so the panel shows what was stored before the page refreshes.
 */
export function rosterAfterSave(
  entries: readonly RosterEntry[],
  participants: readonly WorkspaceParticipant[],
): RosterEntry[] {
  const byStakeholder = new Map(participants.map((p) => [p.StakeholderId, p]));
  return entries.map((entry) => {
    if (entry.IsHistorical) return entry;
    const participant = byStakeholder.get(entry.StakeholderId);
    return {
      ...entry,
      MeetingParticipantId: participant?.MeetingParticipantId ?? null,
      IsApology: participant?.IsApology ?? null,
    };
  });
}

/**
 * The choices still unsaved once a save went through: those made after the
 * save was sent (a pick during a slow save must not vanish), read against what
 * the save stored. A pick that now matches the stored state has nothing left
 * to save.
 */
export function choicesAfterSave(
  before: readonly RosterEntry[],
  after: readonly RosterEntry[],
  sent: Choices,
  current: Choices,
): Map<number, Attendance> {
  const stored = new Map(after.map((entry) => [entry.StakeholderId, entry]));
  const next = new Map<number, Attendance>();
  for (const entry of before) {
    if (entry.IsHistorical) continue;
    const wanted = attendanceOf(entry, current);
    if (wanted === attendanceOf(entry, sent)) continue;
    const now = stored.get(entry.StakeholderId);
    if (now && !now.IsHistorical && wanted !== savedAttendance(now)) {
      next.set(entry.StakeholderId, wanted);
    }
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
