"use client";

import { useState, useTransition } from "react";
import { useAnnouncer } from "@/components/ui/announcer";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ErrorSummary } from "@/components/ui/form/error-summary";
import { useToast } from "@/components/ui/toast";
import { TONES } from "@/components/ui/tones";
import { OVERRIDABLE_MODULES, OVERRIDE_VERBS, type PermissionOverride } from "@/lib/auth/rbac";
import type { AccessLevel } from "@/lib/auth/types";
import { messages } from "@/lib/messages";
import { setProjectPermissionsAction } from "../actions";
import {
  SECTION_LABELS,
  VERB_LABELS,
  cellKey,
  choicesFrom,
  levelAllows,
  overridesFrom,
  type Choice,
  type Choices,
} from "./permission-matrix";

const P = messages.projects.permissions;

export interface PermissionsTarget {
  userId: number;
  personName: string;
  accessLevel: AccessLevel;
  accessLabel: string;
  overrides: PermissionOverride[];
}

/**
 * "Permissions: <person>" — the team's cog (ADR-0024). Per section, adding,
 * editing and deleting each follow the access level ("Default (yes/no)") or are
 * allowed / denied for this person in this project. Only differences are saved
 * (dbo.usp_ProjectPermission_Set); the procs enforce them on every write.
 */
export function PermissionsDialog({
  projectId,
  target,
  onClose,
  onSaved,
}: {
  projectId: number;
  target: PermissionsTarget | null;
  onClose: () => void;
  onSaved: (userId: number, overrides: PermissionOverride[]) => void;
}) {
  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={target ? P.title(target.personName) : ""}
      wide
    >
      {target ? (
        <PermissionsEditor
          key={target.userId}
          projectId={projectId}
          target={target}
          onDone={onClose}
          onSaved={onSaved}
        />
      ) : null}
    </Dialog>
  );
}

function PermissionsEditor({
  projectId,
  target,
  onDone,
  onSaved,
}: {
  projectId: number;
  target: PermissionsTarget;
  onDone: () => void;
  onSaved: (userId: number, overrides: PermissionOverride[]) => void;
}) {
  const [choices, setChoices] = useState<Choices>(() => choicesFrom(target.overrides));
  const [summary, setSummary] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { toast } = useToast();
  const { announce } = useAnnouncer();

  const save = () =>
    startTransition(async () => {
      const result = await setProjectPermissionsAction({
        projectId,
        userId: target.userId,
        overrides: overridesFrom(target.accessLevel, choices),
      });
      if (result.ok) {
        onSaved(target.userId, result.data);
        toast({ variant: "success", title: P.saved(target.personName) });
        announce(P.saved(target.personName));
        onDone();
      } else {
        setSummary(result.error.message);
      }
    });

  return (
    <div className="flex flex-col gap-4">
      <ErrorSummary message={summary} />
      <p className="text-sm text-ink-muted">
        {P.level(target.accessLabel)}. {P.hint}
      </p>
      <div className="max-h-[55vh] overflow-auto">
        <table className="w-full border-collapse text-sm" data-testid="permission-matrix">
          <thead>
            <tr>
              <th
                scope="col"
                className="border border-line bg-surface-raised px-2 py-2 text-left font-medium text-ink-muted"
              >
                {P.section}
              </th>
              {OVERRIDE_VERBS.map((verb) => (
                <th
                  key={verb}
                  scope="col"
                  className="border border-line bg-surface-raised px-2 py-2 text-left font-medium text-ink-muted"
                >
                  {VERB_LABELS[verb]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {OVERRIDABLE_MODULES.map((module) => (
              <tr key={module}>
                <th
                  scope="row"
                  className="border border-line px-2 py-1 text-left font-normal text-ink"
                >
                  {SECTION_LABELS[module]}
                </th>
                {OVERRIDE_VERBS.map((verb) => {
                  const key = cellKey(module, verb);
                  const choice = choices[key] ?? "";
                  const tone =
                    choice === "allow" ? TONES.green.fill : choice === "deny" ? TONES.red.fill : "";
                  return (
                    <td key={verb} className="border border-line p-0">
                      <select
                        aria-label={P.cell(VERB_LABELS[verb], SECTION_LABELS[module])}
                        value={choice}
                        onChange={(e) =>
                          setChoices((current) => ({ ...current, [key]: e.target.value as Choice }))
                        }
                        className={`h-10 w-full min-w-28 cursor-pointer border-0 bg-transparent px-2 text-sm text-inherit ${tone}`}
                      >
                        <option value="">
                          {P.inherit(levelAllows(target.accessLevel, module, verb))}
                        </option>
                        <option value="allow">{P.allow}</option>
                        <option value="deny">{P.deny}</option>
                      </select>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap justify-between gap-2">
        <Button variant="secondary" onClick={() => setChoices({})}>
          {P.reset}
        </Button>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onDone}>
            {messages.actions.cancel}
          </Button>
          <Button onClick={save} pending={pending} data-testid="permissions-save">
            {messages.actions.save}
          </Button>
        </div>
      </div>
    </div>
  );
}
