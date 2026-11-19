"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { IconButton } from "@/components/ui/data-view/datasheet-cells";
import { Combobox, type ComboboxOption } from "@/components/ui/form/combobox";
import { messages } from "@/lib/messages";
import type { StakeholderOption } from "../repository/stakeholder-options";
import { namesAPick, unpickedOptions, type PickedStakeholder } from "../stakeholder-picks";
import { StakeholderQuickCreate, useStakeholderQuickCreate } from "./stakeholder-quick-create";

/**
 * The shared stakeholder picker (ADR-0001: key deliverables use it), laid out like the project
 * team on the Overview: the people picked so far as a short list, each with its ×, and one
 * searchable box under it that adds whoever is chosen and empties for the next. Each row submits
 * a hidden `inputName` entry. A typed name that is not a stakeholder says so and links to the
 * project's stakeholders; with `canAdd` the list starts with "Add new", which opens a short form
 * under the box, and the new stakeholder is picked once saved.
 */
export function StakeholderMultiSelect({
  projectId,
  canAdd,
  options,
  selected,
  disabled,
  inputName,
  removeLabel,
  emptyPlaceholder,
  autoFocus,
  onAdd,
  onRemove,
}: {
  projectId: number;
  /** The viewer may create stakeholders (stakeholders:create); the action checks it again. */
  canAdd: boolean;
  options: StakeholderOption[];
  selected: readonly PickedStakeholder[];
  disabled: boolean;
  inputName: string;
  removeLabel: (name: string) => string;
  /** Shown when nobody is picked and nobody can be: read-only, or a project with no stakeholders. */
  emptyPlaceholder: string;
  autoFocus?: boolean;
  onAdd: (opt: StakeholderOption) => void;
  onRemove: (id: number) => void;
}) {
  const choices = useMemo<ComboboxOption[]>(
    () =>
      unpickedOptions(options, selected).map((o) => ({
        value: String(o.stakeholderId),
        label: o.name,
      })),
    [options, selected],
  );
  const byValue = useMemo(
    () => new Map(options.map((o) => [String(o.stakeholderId), o])),
    [options],
  );
  const add = useCallback(
    (choice: ComboboxOption) => {
      const option = byValue.get(choice.value);
      if (option) onAdd(option);
    },
    [byValue, onAdd],
  );
  const quick = useStakeholderQuickCreate(canAdd);
  const noMatch = useCallback(
    (text: string) =>
      canAdd || namesAPick(selected, text) ? null : (
        <div data-testid="stakeholder-no-match" className="flex flex-wrap items-center gap-x-3">
          <span>
            {messages.stakeholders.notAStakeholder(text)}{" "}
            {messages.stakeholders.addStakeholderFirst}
          </span>
          <Link
            href={`/projects/${projectId}/stakeholders`}
            className="inline-flex min-h-11 items-center font-medium text-accent"
          >
            {messages.stakeholders.viewStakeholders}
          </Link>
        </div>
      ),
    [projectId, canAdd, selected],
  );
  return (
    <div data-testid="stakeholder-picks" className="flex flex-col gap-1.5">
      {selected.length > 0 ? (
        <ul className="m-0 list-none divide-y divide-line rounded-md border border-line bg-surface p-0">
          {selected.map((s) => (
            <li key={s.id} className="flex min-h-10 items-center gap-2 pl-3 text-sm text-ink">
              <input type="hidden" name={inputName} value={s.id} />
              <span className="min-w-0 flex-1 truncate">{s.name}</span>
              {disabled ? null : (
                <IconButton label={removeLabel(s.name)} onClick={() => onRemove(s.id)}>
                  <path d="M4 4l8 8M12 4l-8 8" />
                </IconButton>
              )}
            </li>
          ))}
        </ul>
      ) : disabled ? (
        <p className="m-0 text-sm text-ink-muted">{emptyPlaceholder}</p>
      ) : null}
      {disabled ? null : (
        <Combobox
          options={choices}
          placeholder={
            options.length === 0 ? emptyPlaceholder : messages.stakeholders.picker.placeholder
          }
          autoFocus={autoFocus}
          noMatch={noMatch}
          addNew={quick.addNew}
          onPick={add}
        />
      )}
      {quick.draft === null ? null : (
        <StakeholderQuickCreate
          projectId={projectId}
          typed={quick.draft}
          onCancel={quick.close}
          onCreated={(option) => {
            onAdd(option);
            quick.close();
          }}
        />
      )}
    </div>
  );
}

/**
 * The single-choice stakeholder picker (a meeting action's person
 * responsible): the shared Combobox over the given stakeholders. The picked
 * id submits under `name`; clearing the text submits "" (nobody).
 */
export function StakeholderSelect({
  name,
  options,
  defaultValue,
  onSelect,
  freeTextName,
  defaultFreeText,
  projectId,
  canAdd = false,
}: {
  name: string;
  options: StakeholderOption[];
  defaultValue: number | null;
  onSelect?: (option: ComboboxOption | null) => void;
  /** Submit a name that matches no stakeholder under this field (see Combobox). */
  freeTextName?: string;
  defaultFreeText?: string;
  projectId?: number;
  /** The viewer may create stakeholders (stakeholders:create); needs `projectId`. */
  canAdd?: boolean;
}) {
  const quick = useStakeholderQuickCreate(canAdd && projectId != null);
  const [created, setCreated] = useState<StakeholderOption[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const choices = useMemo(() => {
    const ids = new Set(options.map((o) => o.stakeholderId));
    return [...options, ...created.filter((o) => !ids.has(o.stakeholderId))].map((o) => ({
      value: String(o.stakeholderId),
      label: o.name,
    }));
  }, [options, created]);
  return (
    <div className="flex flex-col gap-1.5">
      <Combobox
        key={picked ?? "start"}
        name={name}
        options={choices}
        defaultValue={picked ?? (defaultValue == null ? "" : String(defaultValue))}
        onSelect={onSelect}
        freeTextName={freeTextName}
        defaultFreeText={picked ? undefined : defaultFreeText}
        addNew={quick.addNew}
      />
      {quick.draft === null || projectId == null ? null : (
        <StakeholderQuickCreate
          projectId={projectId}
          typed={quick.draft}
          onCancel={quick.close}
          onCreated={(option) => {
            const value = String(option.stakeholderId);
            setCreated((c) => [...c, option]);
            setPicked(value);
            onSelect?.({ value, label: option.name });
            quick.close();
          }}
        />
      )}
    </div>
  );
}
