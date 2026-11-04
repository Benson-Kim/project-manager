"use client";

import { useMemo, useState } from "react";
import { listChoices, renamedValue, type LookupListKey } from "@/lib/lookup-lists";
import { useLookupLists } from "../lookup-lists";
import { MultiSelectField, type MultiSelectItem } from "./multi-select";

/**
 * Several labels of one managed list (ADR-0022), as chips — the set a single
 * ListSelect cannot express. The chips submit the labels themselves under a
 * repeated `name`, which a link table stores one row per label; renaming an
 * option cascades to those rows in dbo.usp_LookupList_Set.
 *
 * Uncontrolled, like the form's other fields: it holds the set and tells the
 * caller through `onChange` so an unsaved-changes guard can see the edit.
 */
export function LabelMultiSelect({
  list,
  name,
  defaultValue = [],
  disabled = false,
  removeLabel,
  emptyPlaceholder,
  onChange,
}: {
  list: LookupListKey;
  /** The repeated form field the chips submit, e.g. "objectiveAlignment[]". */
  name: string;
  /** The record's labels; one whose option was retired keeps its chip. */
  defaultValue?: readonly string[];
  disabled?: boolean;
  removeLabel: (label: string) => string;
  /** Shown in the input while the list has no options to pick. */
  emptyPlaceholder: string;
  onChange?: () => void;
}) {
  const { lists } = useLookupLists();
  const options = lists[list];
  const [selected, setSelected] = useState<readonly string[]>(() => [...new Set(defaultValue)]);

  // A chip follows its option's new name once the list editor saves, the rule the single-select
  // keeps (ListSelect). An option that was removed instead keeps the label as stored.
  const [shown, setShown] = useState(options);
  if (shown !== options) {
    setShown(options);
    setSelected((current) => current.map((value) => renamedValue(shown, options, value)));
  }

  const choices = useMemo<MultiSelectItem[]>(() => listChoices(options, false), [options]);
  // A label-bound list stores what it shows, so the chip's text is its value.
  const chips = useMemo<MultiSelectItem[]>(
    () => selected.map((value) => ({ value, label: value })),
    [selected],
  );

  const change = (next: readonly string[]) => {
    setSelected(next);
    onChange?.();
  };

  return (
    <MultiSelectField
      options={choices}
      selected={chips}
      disabled={disabled}
      inputName={name}
      removeLabel={removeLabel}
      emptyPlaceholder={emptyPlaceholder}
      onAdd={(item) => change([...selected, item.value])}
      onRemove={(value) => change(selected.filter((label) => label !== value))}
    />
  );
}
