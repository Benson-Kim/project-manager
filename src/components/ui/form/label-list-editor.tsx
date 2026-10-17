"use client";

import { useState } from "react";
import { messages } from "@/lib/messages";
import { AddOptionRow, OptionRow } from "../data-view/list-editor-dialog";
import {
  addOption,
  labelOptions,
  moveOption,
  optionLabels,
  removeOption,
  renameOption,
  type EditorOption,
} from "../data-view/list-editor-state";

/**
 * A plain list of labels edited as rows, the "Edit dropdown list" rows without
 * colours: rename in place, move, remove and add. `onChange` receives the
 * labels trimmed, blanks dropped, in order.
 */
export function LabelListEditor({
  legend,
  labels,
  onChange,
  maxLength,
  errors,
  testId,
  hideLegend = false,
}: {
  legend: string;
  labels: readonly string[];
  onChange: (labels: string[]) => void;
  maxLength?: number;
  errors?: string[];
  testId?: string;
  /** In a dialog already titled after the list: the legend is for screen readers only. */
  hideLegend?: boolean;
}) {
  const [options, setOptions] = useState(() => labelOptions(labels));
  const [newLabel, setNewLabel] = useState("");
  const [added, setAdded] = useState(0);

  const update = (next: EditorOption[]) => {
    setOptions(next);
    onChange(optionLabels(next));
  };
  const add = () => {
    update(addOption(options, newLabel, `n${added}`));
    setAdded((n) => n + 1);
    setNewLabel("");
  };

  return (
    <fieldset className="flex min-w-0 flex-col gap-2" data-testid={testId}>
      <legend className={hideLegend ? "sr-only" : "mb-1 text-sm leading-6 text-ink"}>
        {legend}
      </legend>
      {options.length === 0 ? (
        <p className="text-sm text-ink-muted">{messages.lookupLists.empty}</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {options.map((option, index) => (
            <OptionRow
              key={option.key}
              option={option}
              position={index + 1}
              error={undefined}
              first={index === 0}
              last={index === options.length - 1}
              maxLength={maxLength}
              onRename={(label) => update(renameOption(options, index, label))}
              onMove={(delta) => update(moveOption(options, index, delta))}
              onRemove={() => update(removeOption(options, index))}
            />
          ))}
        </ol>
      )}
      {errors?.length ? <p className="text-sm text-danger">{errors[0]}</p> : null}
      <AddOptionRow value={newLabel} onChange={setNewLabel} onAdd={add} maxLength={maxLength} />
    </fieldset>
  );
}
