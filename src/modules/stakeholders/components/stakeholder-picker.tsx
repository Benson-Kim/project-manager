"use client";

import { useCallback, useMemo } from "react";
import { Combobox, type ComboboxOption } from "@/components/ui/form/combobox";
import { ChipTag, MultiSelect, type MultiSelectOption } from "@/components/ui/form/multi-select";
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
 * it): the shared MultiSelect over the project's stakeholders.
 */
export function StakeholderMultiSelect({
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
  return (
    <MultiSelect
      options={choices}
      selected={picked}
      disabled={disabled}
      inputName={inputName}
      removeLabel={removeLabel}
      emptyPlaceholder={emptyPlaceholder}
      autoFocus={autoFocus}
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
