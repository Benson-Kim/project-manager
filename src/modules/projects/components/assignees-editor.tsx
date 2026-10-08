"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { useAnnouncer } from "@/components/ui/announcer";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/form/combobox";
import { ErrorSummary } from "@/components/ui/form/error-summary";
import { Field } from "@/components/ui/form/field";
import { Select } from "@/components/ui/form/inputs";
import { useToast } from "@/components/ui/toast";

import { ACCESS_LEVELS, type AccessLevel } from "@/lib/auth/types";
import { messages } from "@/lib/messages";
import { setProjectAssigneesAction } from "../actions";
import type { UserOption } from "../repository/user-options";
import { ASSIGNEE_ROLES, type AssigneeRole, type ProjectAssigneeRow } from "../schemas/project";

const roleLabels: Record<AssigneeRole, string> = {
  ProjectManager: messages.projects.roleProjectManager,
  Sponsor: messages.projects.roleSponsor,
  BusinessAnalyst: messages.projects.roleBusinessAnalyst,
  TeamMember: messages.projects.roleTeamMember,
  Stakeholder: messages.projects.roleStakeholder,
};

const accessLabels: Record<AccessLevel, string> = {
  Viewer: messages.projects.accessViewer,
  Contributor: messages.projects.accessContributor,
  Manager: messages.projects.accessManager,
};

/** A person who can join the team: a user account, or a stakeholder name without one. */
interface Person {
  personName: string;
  userId: number | null;
}

interface Member extends Person {
  role: AssigneeRole;
  accessLevel: AccessLevel;
}

const toMember = (a: ProjectAssigneeRow): Member => ({
  role: a.Role,
  personName: a.PersonName,
  userId: a.UserId,
  accessLevel: a.AccessLevel,
});

/** usp_ProjectAssignee_Set identifies a member by (role, personName). */
const sameSlot = (a: Member, b: Pick<Member, "role" | "personName">) =>
  a.role === b.role && a.personName === b.personName;

/**
 * Project team (req 0.3, ADR-0021): each member has a title (role) and, when
 * linked to a user account, an access level that decides what they may do in
 * this project. Stakeholders without an account can be listed but gain no
 * access. The whole team is saved through usp_ProjectAssignee_Set in one
 * audited transaction, which also stops a manager removing their own access.
 */
export function AssigneesEditor({
  projectId,
  initial,
  users,
  stakeholders,
  canEdit,
}: {
  projectId: number;
  initial: ProjectAssigneeRow[];
  users: UserOption[];
  stakeholders: string[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { announce } = useAnnouncer();
  const [members, setMembers] = useState<Member[]>(initial.map(toMember));
  const [role, setRole] = useState<AssigneeRole>("TeamMember");
  const [accessLevel, setAccessLevel] = useState<AccessLevel>("Contributor");
  const [picked, setPicked] = useState<Person | null>(null);
  const [comboboxKey, setComboboxKey] = useState(0);
  const [summary, setSummary] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Combobox values: "user:<id>" for accounts, "name:<name>" for stakeholders.
  const people = useMemo(
    () =>
      new Map<string, Person>([
        ...users.map((u): [string, Person] => [
          `user:${u.UserId}`,
          { personName: u.DisplayName, userId: u.UserId },
        ]),
        ...stakeholders.map((name): [string, Person] => [
          `name:${name}`,
          { personName: name, userId: null },
        ]),
      ]),
    [users, stakeholders],
  );
  const personOptions = useMemo(
    () =>
      [...people].map(([value, person]) => ({
        value,
        label:
          person.userId === null
            ? messages.projects.assigneeStakeholderOption(person.personName)
            : person.personName,
      })),
    [people],
  );

  /** The team with the picked person added (once per role); name-only members get no access. */
  const withPicked = (current: Member[]): Member[] => {
    if (!picked) return current;
    const member: Member = {
      ...picked,
      role,
      accessLevel: picked.userId === null ? "Viewer" : accessLevel,
    };
    return current.some((m) => sameSlot(m, member)) ? current : [...current, member];
  };

  const resetPicker = () => {
    setPicked(null);
    setComboboxKey((k) => k + 1); // reset the combobox input
  };

  const add = () => {
    setMembers(withPicked);
    resetPicker();
  };

  const remove = (target: Member) => {
    setMembers((current) => current.filter((m) => !sameSlot(m, target)));
  };

  const changeAccess = (target: Member, level: AccessLevel) => {
    setMembers((current) =>
      current.map((m) => (sameSlot(m, target) ? { ...m, accessLevel: level } : m)),
    );
  };

  const save = () => {
    // A person picked but not yet added is saved too.
    const team = withPicked(members);
    // An empty team is valid: usp_ProjectAssignee_Set soft-deletes omitted rows.
    setSummary(null);
    startTransition(async () => {
      const result = await setProjectAssigneesAction({ projectId, assignees: team });
      if (result.ok) {
        // Clear the picker only after the server confirms, so a failed save keeps it for retry.
        resetPicker();
        setMembers(result.data.map(toMember));
        toast({ variant: "success", title: messages.feedback.saved });
        announce(messages.feedback.saved);
        router.refresh();
      } else {
        setSummary(result.error.message);
      }
    });
  };

  return (
    <section
      aria-labelledby="assignees-heading"
      className="flex flex-col gap-4 border border-line rounded-md bg-surface bg-[linear-gradient(to_bottom,var(--surface-raised),var(--surface)_40%)]"
    >
      <h2
        id="assignees-heading"
        className="border-b border-line px-4 py-3 text-base font-semibold text-ink"
      >
        {messages.projects.assigneesSection}
      </h2>
      {canEdit ? (
        <p className="px-4 text-sm text-ink-muted">{messages.projects.assigneeAccessHint}</p>
      ) : null}
      <div className="px-4">
        <ErrorSummary message={summary} />
      </div>
      <div className="px-4">
        {members.length === 0 ? (
          <p className="text-sm text-ink-muted">{messages.projects.noAssignees}</p>
        ) : (
          <ul className="flex flex-col gap-2" data-testid="assignee-list">
            {members.map((m) => (
              <li
                key={`${m.role}:${m.personName}`}
                className="flex min-h-11 flex-wrap items-center justify-between gap-2 rounded-md border border-line px-3 py-1"
              >
                <span className="text-sm text-ink">
                  {m.personName}
                  <span className="ml-2 text-xs text-ink-muted">{roleLabels[m.role]}</span>
                </span>
                <div className="flex items-center gap-2">
                  {m.userId === null ? (
                    <span className="text-xs text-ink-muted">
                      {messages.projects.assigneeNoAccount}
                    </span>
                  ) : canEdit ? (
                    <div className="w-36">
                      <Select
                        aria-label={messages.projects.assigneeAccessFor(m.personName)}
                        value={m.accessLevel}
                        onChange={(e) => changeAccess(m, e.target.value as AccessLevel)}
                      >
                        {ACCESS_LEVELS.map((level) => (
                          <option key={level} value={level}>
                            {accessLabels[level]}
                          </option>
                        ))}
                      </Select>
                    </div>
                  ) : (
                    <span className="text-xs text-ink-muted">{accessLabels[m.accessLevel]}</span>
                  )}
                  {canEdit ? (
                    <Button type="button" variant="ghost" onClick={() => remove(m)}>
                      {messages.projects.removeAssignee(m.personName)}
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {canEdit ? (
        <>
          <div className="grid grid-cols-1 gap-4 px-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label={messages.projects.assigneeName} name="assigneeName">
                <Combobox
                  key={comboboxKey}
                  name="assigneeName"
                  options={personOptions}
                  onSelect={(option) => {
                    setPicked(option ? (people.get(option.value) ?? null) : null);
                    if (option) setSummary(null);
                  }}
                />
              </Field>
            </div>
            <Field label={messages.projects.assigneeRole} name="assigneeRole">
              <Select
                name="assigneeRole"
                value={role}
                onChange={(e) => setRole(e.target.value as AssigneeRole)}
              >
                {ASSIGNEE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {roleLabels[r]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={messages.projects.assigneeAccess} name="assigneeAccess">
              <Select
                name="assigneeAccess"
                value={picked?.userId === null ? "Viewer" : accessLevel}
                disabled={picked?.userId === null}
                onChange={(e) => setAccessLevel(e.target.value as AccessLevel)}
              >
                {ACCESS_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {accessLabels[level]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="flex flex-wrap gap-2 px-4 pb-4">
            <Button type="button" variant="secondary" disabled={!picked} onClick={add}>
              {messages.projects.addAssignee}
            </Button>
            <Button type="button" pending={pending} onClick={save} data-testid="assignees-save">
              {messages.actions.save}
            </Button>
          </div>
        </>
      ) : null}
    </section>
  );
}
