"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { failureMessage } from "@/components/ui/data-view/datasheet";
import { Combobox, type ComboboxOption } from "@/components/ui/form/combobox";
import { ChipTag, MultiSelect, type MultiSelectOption } from "@/components/ui/form/multi-select";
import { useToast } from "@/components/ui/toast";
import { messages } from "@/lib/messages";
import { createStakeholderAction } from "../actions";
import { stakeholderOption, typedNameValues } from "../names";
import type { StakeholderOption } from "../repository/stakeholder-options";

export interface PickedStakeholder {
  id: number;
  name: string;
}

/** Chip tag for a picked stakeholder; its hidden input carries the id in the form's data. */
export function StakeholderChip({
  id,
  name,
  inputName,
  removeLabel,
  disabled,
  onRemove,
}: {
  id: number;
  name: string;
  inputName: string;
  removeLabel: (name: string) => string;
  disabled: boolean;
  onRemove: (id: number) => void;
}) {
  return (
    <ChipTag
      id={id}
      label={name}
      inputName={inputName}
      removeLabel={removeLabel}
      disabled={disabled}
      onRemove={onRemove}
    />
  );
}

/**
 * The shared stakeholder picker (ADR-0001: meetings and key deliverables use
 * it): the shared MultiSelect over the project's stakeholders. A typed name that is not one of
 * them says so and links to the project's stakeholders; with `canAdd` it can also be added as a
 * new stakeholder there and then, and is picked at once.
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
  selected: PickedStakeholder[];
  disabled: boolean;
  inputName: string;
  removeLabel: (name: string) => string;
  /** Shown in the input when the project has no stakeholders. */
  emptyPlaceholder: string;
  autoFocus?: boolean;
  onAdd: (opt: StakeholderOption) => void;
  onRemove: (id: number) => void;
}) {
  const choices = useMemo<MultiSelectOption[]>(
    () => options.map((o) => ({ id: o.stakeholderId, label: o.name })),
    [options],
  );
  const picked = useMemo<MultiSelectOption[]>(
    () => selected.map((s) => ({ id: s.id, label: s.name })),
    [selected],
  );
  const add = useCallback(
    (choice: MultiSelectOption) => {
      const option = options.find((o) => o.stakeholderId === choice.id);
      if (option) onAdd(option);
    },
    [options, onAdd],
  );
  const router = useRouter();
  const { toast } = useToast();
  const [adding, startAdding] = useTransition();
  const addTyped = useCallback(
    (text: string, clear: () => void) =>
      startAdding(async () => {
        const result = await createStakeholderAction(typedNameValues(projectId, text));
        if (!result.ok) {
          toast({ variant: "error", title: failureMessage(result.error) });
          return;
        }
        const option = stakeholderOption(result.data);
        onAdd(option);
        clear();
        toast({ variant: "success", title: messages.stakeholders.stakeholderAdded(option.name) });
        router.refresh();
      }),
    [projectId, onAdd, toast, router],
  );
  const noMatch = useCallback(
    (text: string, clear: () => void) => (
      <div data-testid="stakeholder-no-match" className="flex flex-wrap items-center gap-x-3">
        <span>
          {messages.stakeholders.notAStakeholder(text)}
          {canAdd ? null : ` ${messages.stakeholders.addStakeholderFirst}`}
        </span>
        {canAdd ? (
          <Button
            type="button"
            variant="secondary"
            size="compact"
            className="min-h-11"
            pending={adding}
            onClick={() => addTyped(text, clear)}
          >
            {messages.stakeholders.addAsStakeholder(text)}
          </Button>
        ) : null}
        <Link
          href={`/projects/${projectId}/stakeholders`}
          className="inline-flex min-h-11 items-center font-medium text-accent"
        >
          {messages.stakeholders.viewStakeholders}
        </Link>
      </div>
    ),
    [projectId, canAdd, adding, addTyped],
  );
  return (
    <MultiSelect
      options={choices}
      selected={picked}
      disabled={disabled}
      inputName={inputName}
      removeLabel={removeLabel}
      emptyPlaceholder={emptyPlaceholder}
      autoFocus={autoFocus}
      noMatch={noMatch}
      onAdd={add}
      onRemove={onRemove}
    />
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
}: {
  name: string;
  options: StakeholderOption[];
  defaultValue: number | null;
  onSelect?: (option: ComboboxOption | null) => void;
  /** Submit a name that matches no stakeholder under this field (see Combobox). */
  freeTextName?: string;
  defaultFreeText?: string;
}) {
  const choices = useMemo(
    () => options.map((o) => ({ value: String(o.stakeholderId), label: o.name })),
    [options],
  );
  return (
    <Combobox
      name={name}
      options={choices}
      defaultValue={defaultValue == null ? "" : String(defaultValue)}
      onSelect={onSelect}
      freeTextName={freeTextName}
      defaultFreeText={defaultFreeText}
    />
  );
}
