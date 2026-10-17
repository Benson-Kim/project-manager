"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { useAnnouncer } from "@/components/ui/announcer";
import { Button } from "@/components/ui/button";
import { ErrorSummary } from "@/components/ui/form/error-summary";
import { useUnsavedPart } from "@/components/ui/form/unsaved-scope";
import { useToast } from "@/components/ui/toast";
import { messages } from "@/lib/messages";
import { setParticipantsAction } from "../actions";
import type { MeetingRoster, RosterEntry } from "../schemas/meeting";
import {
  ATTENDANCE,
  attendanceCounts,
  attendanceOf,
  choicesAfterSave,
  choose,
  filterRoster,
  guestEntry,
  guestProblem,
  hasChanges,
  isGuest,
  participantsPayload,
  personKey,
  rosterAfterSave,
  type Attendance,
  type Choices,
} from "../schemas/participant-roster";

const M = messages.meetings;
const NO_CHOICES: Choices = new Map();
const INPUT = "min-h-11 w-full rounded-md border border-line bg-surface px-3 text-sm text-ink";

/**
 * The workspace's participant panel (checklist rows 13 and 54): every
 * stakeholder of the project with Not invited / Attended / Apology, the
 * meeting's guests, a search and the counts. Save sends the whole list once,
 * with the stamp the roster was read with, so a change made by someone else
 * since is a CONFLICT with a reload. A newer roster from a page refresh
 * replaces the panel's own unless it holds unsaved choices; then the save
 * conflicts instead of the choices silently landing on someone else's change.
 * An older roster (two refreshes finishing out of order) is ignored.
 *
 * A guest, someone who is not a stakeholder of the project, is typed in by
 * name and organization and joins the list as attended, unsaved, until Save
 * stores them. Not invited drops an unsaved guest and uninvites a saved one,
 * whose row Set removes.
 */
export function ParticipantsPanel({
  meetingId,
  projectId,
  roster,
  canEdit,
  headingId,
}: {
  meetingId: number;
  projectId: number;
  roster: MeetingRoster;
  canEdit: boolean;
  headingId: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { announce } = useAnnouncer();
  const [base, setBase] = useState(roster);
  const [seen, setSeen] = useState(roster);
  const [choices, setChoices] = useState<Choices>(NO_CHOICES);
  const [drafts, setDrafts] = useState<RosterEntry[]>([]);
  const [query, setQuery] = useState("");
  const [summary, setSummary] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [pending, startTransition] = useTransition();
  const entries = drafts.length === 0 ? base.entries : [...base.entries, ...drafts];
  const dirty = canEdit && hasChanges(entries, choices);
  const { markClean } = useUnsavedPart("meeting-participants", dirty);
  const searchId = useId();

  // A roster read with the panel's own stamp is the same state (another refresh
  // finished); an older one lost a race with a save and is ignored; a newer one
  // replaces the panel's state only when nothing is unsaved.
  if (seen !== roster) {
    setSeen(roster);
    if (roster.stamp === base.stamp) {
      setBase(roster);
    } else if (roster.stamp > base.stamp && !dirty) {
      setBase(roster);
      setChoices(NO_CHOICES);
    }
  }

  const visible = filterRoster(entries, query);
  const counts = attendanceCounts(entries, choices);

  const pick = (entry: RosterEntry, attendance: Attendance) => {
    if (attendance === "none" && isGuest(entry) && entry.MeetingParticipantId === null) {
      const key = personKey(entry);
      setDrafts((current) => current.filter((draft) => personKey(draft) !== key));
      setChoices((current) => {
        const next = new Map(current);
        next.delete(key);
        return next;
      });
      return;
    }
    setChoices((current) => choose(current, entry, attendance));
  };

  const addGuest = (name: string, organization: string): string | null => {
    const problem = guestProblem(entries, name, organization);
    if (problem) return M.guestProblem[problem];
    const draft = guestEntry(name, organization);
    setDrafts((current) => [...current, draft]);
    setChoices((current) => choose(current, draft, "attended"));
    announce(M.guestAdded(draft.Label));
    return null;
  };

  const reload = () => {
    setBase(seen);
    setDrafts([]);
    setChoices(NO_CHOICES);
    setSummary(null);
    setConflict(false);
    markClean();
    router.refresh();
  };

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!dirty) return;
    setSummary(null);
    setConflict(false);
    const sent = choices;
    const sentEntries = entries;
    const sentDrafts = drafts;
    startTransition(async () => {
      const result = await setParticipantsAction({
        meetingId,
        stamp: base.stamp,
        participants: participantsPayload(sentEntries, sent),
      });
      if (result.ok) {
        // The radios stay live during the save: picks made meanwhile are kept
        // over what was stored, so the panel stays dirty until they are saved.
        const stored = result.data
          ? rosterAfterSave(sentEntries, result.data.participants)
          : sentEntries;
        if (result.data) {
          setBase({ entries: stored, stamp: result.data.participantsStamp });
          setDrafts((current) => current.filter((draft) => !sentDrafts.includes(draft)));
        }
        setChoices((current) => choicesAfterSave(sentEntries, stored, sent, current));
        toast({ variant: "success", title: messages.feedback.saved });
        announce(messages.feedback.saved);
        router.refresh();
      } else if (result.error.code === "UNAUTHENTICATED") {
        router.push("/login?reason=expired");
      } else {
        setSummary(result.error.message);
        if (result.error.code === "CONFLICT") setConflict(true);
      }
    });
  };

  return (
    <div className="flex flex-col gap-4" data-testid="participants-panel">
      <div className="flex flex-col gap-1">
        <h2 id={headingId} className="text-base font-medium text-ink">
          {M.participants}
        </h2>
        <p className="text-sm text-ink-muted" data-testid="participant-counts">
          {M.attendedCount(counts.attended)} · {M.apologyCount(counts.apologies)}
        </p>
      </div>
      <ErrorSummary message={summary} />
      {conflict ? (
        <div>
          <Button type="button" variant="secondary" onClick={reload}>
            {M.reload}
          </Button>
        </div>
      ) : null}
      {base.entries.length === 0 ? (
        <div className="flex flex-col gap-1 text-sm text-ink-muted">
          <p>{M.noStakeholders}</p>
          <Link
            href={`/projects/${projectId}/stakeholders`}
            className="inline-flex min-h-11 items-center font-medium text-accent underline"
          >
            {messages.stakeholders.viewStakeholders}
          </Link>
        </div>
      ) : null}
      {entries.length > 0 ? (
        <div className="flex flex-col gap-1">
          <label htmlFor={searchId} className="text-sm font-medium text-ink">
            {M.searchParticipants}
          </label>
          <input
            id={searchId}
            type="search"
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            data-testid="participant-search"
            className={INPUT}
          />
        </div>
      ) : null}
      {canEdit ? <GuestForm onAdd={addGuest} /> : null}
      {entries.length > 0 ? (
        <form
          noValidate
          onSubmit={onSubmit}
          aria-labelledby={headingId}
          className="flex flex-col gap-4"
        >
          {!canEdit ? (
            <p id={`${searchId}-read-only`} className="sr-only">
              {messages.app.readOnly}
            </p>
          ) : null}
          {visible.length === 0 ? (
            <p className="text-sm text-ink-muted">{M.noParticipantMatch}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {visible.map((entry) => (
                <li key={personKey(entry)} className="py-3 first:pt-0">
                  <ParticipantRow
                    entry={entry}
                    attendance={attendanceOf(entry, choices)}
                    disabled={!canEdit || entry.IsHistorical}
                    describedBy={canEdit ? undefined : `${searchId}-read-only`}
                    onPick={pick}
                  />
                </li>
              ))}
            </ul>
          )}
          {canEdit ? (
            <div>
              <Button
                type="submit"
                pending={pending}
                disabled={!dirty}
                data-testid="participants-save"
              >
                {messages.actions.save}
              </Button>
            </div>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}

/** Name and organization of someone who is not a stakeholder; Enter adds them. */
function GuestForm({ onAdd }: { onAdd: (name: string, organization: string) => string | null }) {
  const id = useId();
  const [name, setName] = useState("");
  const [organization, setOrganization] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const problem = onAdd(name, organization);
    setError(problem);
    if (problem) return;
    setName("");
    setOrganization("");
  };
  return (
    <form
      noValidate
      onSubmit={submit}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-hint`}
      className="flex flex-col gap-2 rounded-md border border-line p-3"
      data-testid="guest-form"
    >
      <div className="flex flex-col gap-0.5">
        <p id={`${id}-title`} className="text-sm font-medium text-ink">
          {M.addGuest}
        </p>
        <p id={`${id}-hint`} className="text-xs text-ink-muted">
          {M.addGuestHint}
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-name`} className="text-sm text-ink">
            {M.guestName}
          </label>
          <input
            id={`${id}-name`}
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={255}
            autoComplete="off"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            data-testid="guest-name"
            className={INPUT}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-organization`} className="text-sm text-ink">
            {M.guestOrganization}
          </label>
          <input
            id={`${id}-organization`}
            value={organization}
            onChange={(event) => setOrganization(event.target.value)}
            maxLength={255}
            autoComplete="organization"
            data-testid="guest-organization"
            className={INPUT}
          />
        </div>
        <Button type="submit" variant="secondary" data-testid="guest-add">
          {M.addGuestAction}
        </Button>
      </div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </form>
  );
}

/** One person: a radio group named by their label. */
function ParticipantRow({
  entry,
  attendance,
  disabled,
  describedBy,
  onPick,
}: {
  entry: RosterEntry;
  attendance: Attendance;
  disabled: boolean;
  describedBy?: string;
  onPick: (entry: RosterEntry, attendance: Attendance) => void;
}) {
  const name = useId();
  return (
    <fieldset
      disabled={disabled}
      aria-describedby={describedBy}
      data-testid="participant-row"
      className="min-w-0"
    >
      <legend className="mb-2 text-sm text-ink wrap-anywhere">
        {entry.Label}
        {isGuest(entry) ? <span className="block text-xs text-ink-muted">{M.guest}</span> : null}
        {entry.IsHistorical ? (
          <span className="block text-xs text-ink-muted">{M.historical}</span>
        ) : null}
      </legend>
      <div className="grid grid-cols-3 gap-1">
        {ATTENDANCE.map((value) => (
          <label
            key={value}
            className="flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-line px-1.5 text-center text-sm text-ink has-checked:border-accent has-checked:bg-accent-soft has-checked:font-medium has-disabled:cursor-default"
          >
            <input
              type="radio"
              name={name}
              value={value}
              checked={attendance === value}
              onChange={() => onPick(entry, value)}
              className="size-4 shrink-0 accent-accent"
            />
            <span>{M.attendance[value]}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
