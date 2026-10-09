"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { useAnnouncer } from "@/components/ui/announcer";
import { IconButton } from "@/components/ui/data-view/datasheet-cells";
import { ListEditorDialog } from "@/components/ui/data-view/list-editor-dialog";
import { Combobox } from "@/components/ui/form/combobox";
import { ErrorSummary } from "@/components/ui/form/error-summary";
import { ListOptions, useLookupLists } from "@/components/ui/lookup-lists";
import { useToast } from "@/components/ui/toast";

import type { PermissionOverride } from "@/lib/auth/rbac";
import { ACCESS_LEVELS, type AccessLevel } from "@/lib/auth/types";
import { messages } from "@/lib/messages";
import { setProjectAssigneesAction } from "../actions";
import type { UserOption } from "../repository/user-options";
import type { ProjectAssigneeRow } from "../schemas/project";
import { PermissionsDialog, type PermissionsTarget } from "./permissions-dialog";

const TITLES = "project-assignee.title" as const;
/** The title a new member starts with, when the list still has it. */
const DEFAULT_TITLE = "Team member";

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
  role: string;
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

const cell = "border border-line p-0 align-middle";
const control =
  "h-10 w-full min-w-0 cursor-pointer border-0 bg-transparent px-2 text-sm text-ink hover:bg-surface-sunken focus:bg-surface";

/**
 * Project team (req 0.3, ADR-0021/0024) as an inline grid, like the datasheets:
 * a member's title (the managed list 'project-assignee.title') and access level
 * are edited in place and saved at once; × removes; the bottom row adds a
 * person. The ⚙ opens their per-section permissions in this project. The whole
 * team is saved through usp_ProjectAssignee_Set in one audited transaction,
 * which also stops a manager removing their own access.
 */
export function AssigneesEditor({
  projectId,
  initial,
  users,
  stakeholders,
  canEdit,
  overrides: initialOverrides,
  actorUserId,
  isAdmin,
}: {
  projectId: number;
  initial: ProjectAssigneeRow[];
  users: UserOption[];
  stakeholders: string[];
  canEdit: boolean;
  /** Each member's permission overrides by user id (loaded for Managers only). */
  overrides: Record<number, PermissionOverride[]>;
  actorUserId: number;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { announce } = useAnnouncer();
  const { canEdit: canEditLists, lists } = useLookupLists();
  const [members, setMembers] = useState<Member[]>(initial.map(toMember));
  const [overrides, setOverrides] = useState(initialOverrides);
  const [summary, setSummary] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [permissionsFor, setPermissionsFor] = useState<PermissionsTarget | null>(null);
  const [editingTitles, setEditingTitles] = useState(false);

  const defaultTitle =
    lists[TITLES]?.options.find((o) => o.label === DEFAULT_TITLE)?.label ??
    lists[TITLES]?.options[0]?.label ??
    DEFAULT_TITLE;
  const [picked, setPicked] = useState<Person | null>(null);
  const [newTitle, setNewTitle] = useState(defaultTitle);
  const [newAccess, setNewAccess] = useState<AccessLevel>("Contributor");
  const [comboboxKey, setComboboxKey] = useState(0);

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

  /** Saves the whole team at once; a refusal restores what was there. */
  const saveTeam = (next: Member[], after?: () => void) => {
    const before = members;
    setMembers(next);
    setSummary(null);
    startTransition(async () => {
      const result = await setProjectAssigneesAction({ projectId, assignees: next });
      if (result.ok) {
        setMembers(result.data.map(toMember));
        announce(messages.projects.teamSaved);
        after?.();
        router.refresh();
      } else {
        setMembers(before);
        setSummary(result.error.message);
      }
    });
  };

  const update = (target: Member, change: Partial<Member>) =>
    saveTeam(members.map((m) => (sameSlot(m, target) ? { ...m, ...change } : m)));

  const remove = (target: Member) => saveTeam(members.filter((m) => !sameSlot(m, target)));

  const add = () => {
    if (!picked) return;
    const member: Member = {
      ...picked,
      role: newTitle,
      accessLevel: picked.userId === null ? "Viewer" : newAccess,
    };
    if (members.some((m) => sameSlot(m, member))) return;
    saveTeam([...members, member], () => {
      setPicked(null);
      setComboboxKey((k) => k + 1);
      toast({ variant: "success", title: messages.projects.teamSaved });
    });
  };

  /** Titles select: the managed list, plus "Edit list…" for Admins. */
  const titleSelect = (value: string, label: string, onChange: (title: string) => void) => (
    <select
      aria-label={label}
      value={value}
      disabled={pending}
      onChange={(e) => {
        if (e.target.value === "__edit-list__") {
          setEditingTitles(true);
          return;
        }
        onChange(e.target.value);
      }}
      className={control}
    >
      <ListOptions list={TITLES} current={value} />
      {canEditLists ? (
        <option value="__edit-list__">{messages.lookupLists.editInline}</option>
      ) : null}
    </select>
  );

  return (
    <section
      aria-labelledby="assignees-heading"
      className="flex flex-col gap-4 rounded-md border border-line bg-surface bg-[linear-gradient(to_bottom,var(--surface-raised),var(--surface)_40%)]"
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
      <div className="relative overflow-x-auto px-4 pb-4">
        <table className="w-full border-collapse text-sm" data-testid="assignee-list">
          <thead>
            <tr>
              <th
                scope="col"
                className="border border-line bg-surface-raised px-2 py-2 text-left font-medium text-ink-muted"
              >
                {messages.projects.assigneeName}
              </th>
              <th
                scope="col"
                className="border border-line bg-surface-raised px-2 py-2 text-left font-medium text-ink-muted"
              >
                {messages.projects.assigneeTitle}
              </th>
              <th
                scope="col"
                className="border border-line bg-surface-raised px-2 py-2 text-left font-medium text-ink-muted"
              >
                {messages.projects.assigneeAccess}
              </th>
              {canEdit ? (
                <th scope="col" className="w-20 border border-line bg-surface-raised px-2 py-2">
                  <span className="sr-only">{messages.datasheet.actions}</span>
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {members.length === 0 ? (
              <tr>
                <td
                  colSpan={canEdit ? 4 : 3}
                  className="border border-line px-2 py-3 text-ink-muted"
                >
                  {messages.projects.noAssignees}
                </td>
              </tr>
            ) : null}
            {members.map((m) => {
              const memberOverrides = m.userId === null ? [] : (overrides[m.userId] ?? []);
              const canManagePermissions =
                canEdit && m.userId !== null && (isAdmin || m.userId !== actorUserId);
              return (
                <tr key={`${m.role}:${m.personName}`}>
                  <td className="border border-line px-2 py-2 text-ink">{m.personName}</td>
                  <td className={canEdit ? cell : "border border-line px-2 py-2 text-ink-muted"}>
                    {canEdit
                      ? titleSelect(
                          m.role,
                          messages.projects.assigneeTitleFor(m.personName),
                          (role) => update(m, { role }),
                        )
                      : m.role}
                  </td>
                  <td
                    className={
                      canEdit && m.userId !== null
                        ? cell
                        : "border border-line px-2 py-2 text-ink-muted"
                    }
                  >
                    {m.userId === null ? (
                      messages.projects.assigneeNoAccount
                    ) : canEdit ? (
                      <select
                        aria-label={messages.projects.assigneeAccessFor(m.personName)}
                        value={m.accessLevel}
                        disabled={pending}
                        onChange={(e) => update(m, { accessLevel: e.target.value as AccessLevel })}
                        className={control}
                      >
                        {ACCESS_LEVELS.map((level) => (
                          <option key={level} value={level}>
                            {accessLabels[level]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      accessLabels[m.accessLevel]
                    )}
                  </td>
                  {canEdit ? (
                    <td className="border border-line px-1 py-0">
                      <div className="flex items-center justify-end">
                        {canManagePermissions ? (
                          <span className="relative">
                            <IconButton
                              label={messages.projects.permissionsFor(m.personName)}
                              onClick={() =>
                                setPermissionsFor({
                                  userId: m.userId!,
                                  personName: m.personName,
                                  accessLevel: m.accessLevel,
                                  accessLabel: accessLabels[m.accessLevel],
                                  overrides: memberOverrides,
                                })
                              }
                            >
                              <CogIcon />
                            </IconButton>
                            {memberOverrides.length > 0 ? (
                              <span
                                title={messages.projects.customPermissions}
                                className="absolute top-1.5 right-1 size-2 rounded-full bg-accent"
                              />
                            ) : null}
                          </span>
                        ) : null}
                        <IconButton
                          label={messages.projects.removeAssignee(m.personName)}
                          onClick={() => remove(m)}
                          disabled={pending}
                        >
                          <path d="M4 4l8 8M12 4l-8 8" />
                        </IconButton>
                      </div>
                    </td>
                  ) : null}
                </tr>
              );
            })}
            {canEdit ? (
              <tr className="bg-surface-raised" data-testid="team-add-row">
                <td className="border border-line p-0">
                  <Combobox
                    key={comboboxKey}
                    name="assigneeName"
                    ariaLabel={messages.projects.assigneeName}
                    placeholder={messages.projects.newMemberPlaceholder}
                    inCell
                    options={personOptions}
                    onSelect={(option) => {
                      setPicked(option ? (people.get(option.value) ?? null) : null);
                      if (option) setSummary(null);
                    }}
                  />
                </td>
                <td className={cell}>
                  {titleSelect(
                    newTitle,
                    `${messages.datasheet.newEntry}: ${messages.projects.assigneeTitle}`,
                    setNewTitle,
                  )}
                </td>
                <td className={cell}>
                  <select
                    aria-label={`${messages.datasheet.newEntry}: ${messages.projects.assigneeAccess}`}
                    value={picked?.userId === null ? "Viewer" : newAccess}
                    disabled={picked?.userId === null}
                    onChange={(e) => setNewAccess(e.target.value as AccessLevel)}
                    className={control}
                  >
                    {ACCESS_LEVELS.map((level) => (
                      <option key={level} value={level}>
                        {accessLabels[level]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="border border-line px-1 py-0">
                  <div className="flex items-center justify-end">
                    <IconButton
                      label={messages.projects.addAssignee}
                      onClick={add}
                      disabled={!picked || pending}
                      className="text-success"
                    >
                      <path d="M3 8.5l3.5 3.5L13 5" />
                    </IconButton>
                  </div>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <PermissionsDialog
        projectId={projectId}
        target={permissionsFor}
        onClose={() => setPermissionsFor(null)}
        onSaved={(userId, saved) => setOverrides((current) => ({ ...current, [userId]: saved }))}
      />
      {editingTitles ? (
        <ListEditorDialog
          listKey={TITLES}
          column={messages.projects.assigneeTitle}
          open
          onOpenChange={(open) => {
            if (!open) setEditingTitles(false);
          }}
        />
      ) : null}
    </section>
  );
}

/** A cog wheel (24-unit outline scaled into IconButton's 16-unit box). */
export function CogIcon() {
  return (
    <g transform="scale(0.6667)" strokeWidth="2.4">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </g>
  );
}
