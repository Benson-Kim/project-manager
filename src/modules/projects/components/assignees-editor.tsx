"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { useAnnouncer } from "@/components/ui/announcer";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/form/combobox";
import { ErrorSummary } from "@/components/ui/form/error-summary";
import { Field } from "@/components/ui/form/field";
import { Select } from "@/components/ui/form/inputs";
import { useToast } from "@/components/ui/toast";

import { messages } from "@/lib/messages";
import { setProjectAssigneesAction } from "../actions";
import { ASSIGNEE_ROLES, type AssigneeRole, type ProjectAssigneeRow } from "../schemas/project";

const roleLabels: Record<AssigneeRole, string> = {
  ProjectManager: messages.projects.roleProjectManager,
  Sponsor: messages.projects.roleSponsor,
  BusinessAnalyst: messages.projects.roleBusinessAnalyst,
};

interface Assignee {
  role: AssigneeRole;
  personName: string;
  userId: number | null;
}

/**
 * Assignees section (req 0.3 — one or many PMs/Sponsors/BAs). Combobox
 * multi-add from the project's stakeholders; the whole set is saved through
 * usp_ProjectAssignee_Set in one audited transaction.
 */
export function AssigneesEditor({
  projectId,
  initial,
  options,
  canEdit,
}: {
  projectId: number;
  initial: ProjectAssigneeRow[];
  options: string[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { announce } = useAnnouncer();
  const [assignees, setAssignees] = useState<Assignee[]>(
    initial.map((a) => ({ role: a.Role, personName: a.PersonName, userId: a.UserId })),
  );
  const [role, setRole] = useState<AssigneeRole>("ProjectManager");
  const [picked, setPicked] = useState<string | null>(null);
  const [comboboxKey, setComboboxKey] = useState(0);
  const [summary, setSummary] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const add = () => {
    if (!picked) return;
    const exists = assignees.some((a) => a.role === role && a.personName === picked);
    if (!exists) {
      setAssignees((current) => [...current, { role, personName: picked, userId: null }]);
    }
    setPicked(null);
    setComboboxKey((k) => k + 1); // reset the combobox input
  };

  const remove = (target: Assignee) => {
    setAssignees((current) =>
      current.filter((a) => !(a.role === target.role && a.personName === target.personName)),
    );
  };

  const save = () => {
    // Auto-add any name that's been typed/picked but not yet added.
    const pending_list = picked
      ? (() => {
          const exists = assignees.some((a) => a.role === role && a.personName === picked);
          return exists ? assignees : [...assignees, { role, personName: picked, userId: null }];
        })()
      : assignees;
    // An empty pending_list is intentional: the proc accepts it and
    // soft-deletes all existing assignees (clearing the project is allowed).
    setPicked(null);
    setComboboxKey((k) => k + 1);
    setSummary(null);
    startTransition(async () => {
      const result = await setProjectAssigneesAction({ projectId, assignees: pending_list });
      if (result.ok) {
        setAssignees(
          result.data.map((a) => ({ role: a.Role, personName: a.PersonName, userId: a.UserId })),
        );
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
      className="flex flex-col gap-4 border border-line rounded-md bg-surface [background-image:linear-gradient(to_bottom,var(--surface-raised),var(--surface)_40%)]"
    >
      <h2
        id="assignees-heading"
        className="border-b border-line px-4 py-3 text-base font-semibold text-ink"
      >
        {messages.projects.assigneesSection}
      </h2>
      <div className="px-4">
        <ErrorSummary message={summary} />
      </div>
      <div className="px-4">
        {assignees.length === 0 ? (
          <p className="text-sm text-ink-muted">{messages.projects.noAssignees}</p>
        ) : (
          <ul className="flex flex-col gap-2" data-testid="assignee-list">
            {assignees.map((a) => (
              <li
                key={`${a.role}:${a.personName}`}
                className="flex min-h-11 items-center justify-between gap-2 rounded-md border border-line px-3"
              >
                <span className="text-sm text-ink">
                  {a.personName}
                  <span className="ml-2 text-xs text-ink-muted">{roleLabels[a.role]}</span>
                </span>
                {canEdit ? (
                  <Button type="button" variant="ghost" onClick={() => remove(a)}>
                    {messages.projects.removeAssignee(a.personName)}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {canEdit ? (
        <>
          <div className="grid grid-cols-1 gap-4 px-4 sm:grid-cols-2">
            <Field label={messages.projects.assigneeName} name="assigneeName">
              <Combobox
                key={comboboxKey}
                name="assigneeName"
                options={options.map((o) => ({ value: o, label: o }))}
                onSelect={(option) => {
                  setPicked(option?.value ?? null);
                  if (option?.value) setSummary(null);
                }}
              />
            </Field>
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
          </div>
          <div className="flex flex-wrap gap-2 px-4 pb-4">
            <Button type="button" variant="secondary" onClick={add}>
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
