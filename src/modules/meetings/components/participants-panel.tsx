"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { useAnnouncer } from "@/components/ui/announcer";
import { Button } from "@/components/ui/button";
import { ErrorSummary } from "@/components/ui/form/error-summary";
import { useUnsavedPart } from "@/components/ui/form/unsaved-scope";
import { useToast } from "@/components/ui/toast";
import { PANEL_BODY, PANEL_SHELL } from "@/components/ui/panel-styles";
import { messages } from "@/lib/messages";
import { getLastMeetingAttendeesAction, setParticipantsAction } from "../actions";
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
import { notifySaved } from "@/lib/cross-window";

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
  const [importPending, setImportPending] = useState(false);
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

  const removeEntry = (entry: RosterEntry) => {
    if (isGuest(entry) && entry.MeetingParticipantId === null) {
      const key = personKey(entry);
      setDrafts((current) => current.filter((draft) => personKey(draft) !== key));
      setChoices((current) => {
        const next = new Map(current);
        next.delete(key);
        return next;
      });
      return;
    }
    setChoices((current) => choose(current, entry, "none"));
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

  const handleImportFromLast = async () => {
    setImportPending(true);
    try {
      const result = await getLastMeetingAttendeesAction({ meetingId, projectId });
      if (!result.ok) {
        toast({ variant: "error", title: result.error.message });
        return;
      }
      if (!result.data || result.data.attendees.length === 0) {
        toast({ variant: "warning", title: M.noPreviousMeeting });
        return;
      }

      let addedCount = 0;
      let nextChoices = new Map(choices);
      const nextDrafts = [...drafts];
      const existingLabels = new Set(entries.map((e) => e.Label.toLowerCase()));

      for (const att of result.data.attendees) {
        if (att.StakeholderId !== null) {
          const match = entries.find((e) => e.StakeholderId === att.StakeholderId);
          if (match) {
            const currentAtt = attendanceOf(match, nextChoices);
            if (currentAtt !== "attended") {
              nextChoices = choose(nextChoices, match, "attended");
              addedCount++;
            }
          }
        } else {
          // Guest
          if (!existingLabels.has(att.Label.toLowerCase())) {
            const [name, ...orgParts] = att.Label.split(" - ");
            const org = orgParts.join(" - ");
            const draft = guestEntry(name.trim(), org.trim());
            nextDrafts.push(draft);
            nextChoices = choose(nextChoices, draft, "attended");
            existingLabels.add(att.Label.toLowerCase());
            addedCount++;
          }
        }
      }

      if (addedCount === 0) {
        toast({ variant: "info", title: M.allAttendeesImported });
        return;
      }

      setDrafts(nextDrafts);
      setChoices(nextChoices);
      toast({ variant: "success", title: M.importedAttendees(addedCount) });
      announce(M.importedAttendees(addedCount));
    } finally {
      setImportPending(false);
    }
  };

  const reload = () => {
    setBase(seen);
    setDrafts([]);
    setChoices(NO_CHOICES);
    setSummary(null);
    setConflict(false);
    markClean();
    router.refresh();
    notifySaved();
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
        notifySaved();
      } else if (result.error.code === "UNAUTHENTICATED") {
        router.push("/login?reason=expired");
      } else {
        setSummary(result.error.message);
        if (result.error.code === "CONFLICT") setConflict(true);
      }
    });
  };

  return (
    <section className={PANEL_SHELL} data-testid="participants-panel" aria-labelledby={headingId}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <div className="flex items-center gap-2">
          <h2
            id={headingId}
            className="text-xs font-semibold uppercase tracking-wide text-ink-muted"
          >
            {M.participants}
          </h2>
          <span className="text-xs text-ink-muted" data-testid="participant-counts">
            ({M.attendedCount(counts.attended)} · {M.apologyCount(counts.apologies)})
          </span>
        </div>
        {canEdit ? (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              pending={importPending}
              onClick={handleImportFromLast}
              className="min-h-7 px-2.5 py-0.5 text-xs font-semibold"
            >
              ⬆ {M.importFromLast}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                const el = document.getElementById(`${searchId}-guest-name`);
                el?.focus();
                el?.scrollIntoView({ behavior: "smooth", block: "center" });
              }}
              className="min-h-7 px-2.5 py-0.5 text-xs font-semibold"
            >
              + {M.guest.split(",")[0]}
            </Button>
            <Link
              href={`/projects/${projectId}/stakeholders`}
              className="inline-flex min-h-7 items-center rounded-md border border-line bg-surface px-2.5 py-0.5 text-xs font-semibold text-ink transition-colors hover:bg-surface-soft"
            >
              + {M.member}
            </Link>
          </div>
        ) : null}
      </div>

      <div className={PANEL_BODY}>
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
              className="inline-flex min-h-11 items-center font-medium text-accent"
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
        {canEdit ? <GuestForm idPrefix={searchId} onAdd={addGuest} /> : null}
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
                  <li key={personKey(entry)} className="py-2 first:pt-0">
                    <ParticipantRow
                      entry={entry}
                      attendance={attendanceOf(entry, choices)}
                      disabled={!canEdit || entry.IsHistorical}
                      describedBy={canEdit ? undefined : `${searchId}-read-only`}
                      onPick={pick}
                      onRemove={canEdit ? removeEntry : undefined}
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
    </section>
  );
}

/** Name and organization of someone who is not a stakeholder; Enter adds them. */
function GuestForm({
  idPrefix,
  onAdd,
}: {
  idPrefix?: string;
  onAdd: (name: string, organization: string) => string | null;
}) {
  const generatedId = useId();
  const id = idPrefix ? `${idPrefix}-guest` : generatedId;
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

/** One person: a radio group named by their label with prototype styling. */
function ParticipantRow({
  entry,
  attendance,
  disabled,
  describedBy,
  onPick,
  onRemove,
}: {
  entry: RosterEntry;
  attendance: Attendance;
  disabled: boolean;
  describedBy?: string;
  onPick: (entry: RosterEntry, attendance: Attendance) => void;
  onRemove?: (entry: RosterEntry) => void;
}) {
  const name = useId();
  const guest = isGuest(entry);

  let displayName = entry.Label;
  let roleOrg = "";
  if (guest) {
    displayName = entry.GuestName || entry.Label;
    roleOrg = entry.GuestOrganization || "";
  } else {
    const parts = entry.Label.split(" - ");
    displayName = parts[0];
    roleOrg = parts.slice(1).join(" - ");
  }

  let statusBorder = "border-l-4 border-transparent hover:bg-surface-soft";
  if (attendance === "attended") {
    statusBorder = "border-l-4 border-emerald-500 bg-emerald-50/40";
  } else if (attendance === "apology") {
    statusBorder = "border-l-4 border-amber-500 bg-amber-50/40";
  }

  return (
    <fieldset
      disabled={disabled}
      aria-describedby={describedBy}
      data-testid="participant-row"
      className={`group flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 rounded-md px-3 py-2 transition-colors min-w-0 ${statusBorder}`}
    >
      <legend className="sr-only">
        {entry.Label}
        {guest ? ` - ${M.guest}` : ""}
        {entry.IsHistorical ? ` - ${M.historical}` : ""}
      </legend>

      <div className="flex flex-col min-w-0 flex-1">
        <span className="block truncate text-sm text-ink" title={displayName}>
          {displayName}
        </span>
        {guest ? (
          <span className="block truncate text-xs text-ink-muted">
            {roleOrg ? `${roleOrg} · ` : ""}
            {M.guest}
          </span>
        ) : roleOrg ? (
          <span className="block truncate text-xs text-ink-muted" title={roleOrg}>
            {roleOrg}
          </span>
        ) : null}
        {entry.IsHistorical ? (
          <span className="block text-xs text-ink-muted">{M.historical}</span>
        ) : null}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {guest ? (
          <span className="rounded px-1.5 py-0.5 text-[10px] font-bold capitalize tracking-wider border border-purple-200 text-purple-700 bg-purple-50 shrink-0">
            {M.guest.split(",")[0]}
          </span>
        ) : (
          <span className="rounded px-1.5 py-0.5 text-[10px] font-bold capitalize tracking-wider border border-indigo-200 text-indigo-700 bg-indigo-50 shrink-0">
            {M.member}
          </span>
        )}

        <div className="inline-flex rounded border border-line bg-surface overflow-hidden">
          {ATTENDANCE.map((value) => {
            const isChecked = attendance === value;
            let activeStyle = "";
            if (isChecked) {
              if (value === "attended") activeStyle = "bg-emerald-500 text-white font-semibold";
              else if (value === "apology") activeStyle = "bg-amber-500 text-white font-semibold";
              else activeStyle = "bg-slate-400 text-white font-semibold";
            } else {
              activeStyle = "text-ink-muted hover:bg-surface-soft hover:text-ink";
            }
            return (
              <label
                key={value}
                className={`flex min-h-7 cursor-pointer items-center justify-center px-2.5 py-1 text-xs border-r border-line last:border-r-0 transition-colors ${activeStyle}`}
              >
                <input
                  type="radio"
                  name={name}
                  value={value}
                  checked={isChecked}
                  onChange={() => onPick(entry, value)}
                  className="sr-only"
                />
                <span>{M.attendance[value]}</span>
              </label>
            );
          })}
        </div>

        {onRemove && !disabled ? (
          <button
            type="button"
            onClick={() => onRemove(entry)}
            title={messages.actions.delete}
            className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity p-1 text-ink-muted hover:text-danger hover:bg-danger-soft rounded text-base leading-none"
          >
            ×
          </button>
        ) : (
          <span className="w-5" />
        )}
      </div>
    </fieldset>
  );
}
