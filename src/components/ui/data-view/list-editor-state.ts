import {
  saveLookupListInput,
  type LookupList,
  type LookupListKey,
  type OptionColor,
} from "@/lib/lookup-lists";

/**
 * Pure state of the "Edit dropdown list" dialog (ADR-0022). DOM-free so Vitest
 * covers it (ADR-0013); the dialog only renders it.
 */
export interface EditorOption {
  /** Stable React key: the option id, or a local counter for new options. */
  key: string;
  /** null = added in this dialog. */
  id: number | null;
  label: string;
  locked: boolean;
  /** The value's colour (migration 020); null = none. Locked options can be recoloured. */
  color: OptionColor | null;
}

export function editorOptions(list: LookupList | undefined): EditorOption[] {
  return (list?.options ?? []).map((option) => ({
    key: `o${option.id}`,
    id: option.id,
    label: option.label,
    locked: option.locked,
    color: option.color,
  }));
}

export function renameOption(
  options: EditorOption[],
  index: number,
  label: string,
): EditorOption[] {
  return options.map((option, i) =>
    i === index && !option.locked ? { ...option, label } : option,
  );
}

export function recolorOption(
  options: EditorOption[],
  index: number,
  color: OptionColor | null,
): EditorOption[] {
  return options.map((option, i) => (i === index ? { ...option, color } : option));
}

/** Moves an option one place up (-1) or down (+1); out-of-range moves change nothing. */
export function moveOption(options: EditorOption[], index: number, delta: -1 | 1): EditorOption[] {
  const target = index + delta;
  if (index < 0 || index >= options.length || target < 0 || target >= options.length)
    return options;
  const next = [...options];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** Removes an option; locked options stay. */
export function removeOption(options: EditorOption[], index: number): EditorOption[] {
  return options[index]?.locked ? options : options.filter((_, i) => i !== index);
}

/** Appends a new option (trimmed); a blank label changes nothing. */
export function addOption(options: EditorOption[], label: string, key: string): EditorOption[] {
  const trimmed = label.trim();
  return trimmed
    ? [...options, { key, id: null, label: trimmed, locked: false, color: null }]
    : options;
}

/** The save input, validated by the same schema the Server Action uses. */
export function toSaveInput(
  listKey: LookupListKey,
  rowVer: number,
  options: EditorOption[],
  tintRows?: boolean,
) {
  return {
    listKey,
    rowVer,
    tintRows,
    options: options.map((option) => ({
      id: option.id,
      label: option.label,
      color: option.color,
    })),
  };
}

/** Per-option validation messages (index → message); empty when the list can be saved. */
export function optionErrors(
  listKey: LookupListKey,
  rowVer: number,
  options: EditorOption[],
): Record<number, string> {
  const parsed = saveLookupListInput.safeParse(toSaveInput(listKey, rowVer, options));
  if (parsed.success) return {};
  const errors: Record<number, string> = {};
  for (const issue of parsed.error.issues) {
    const [, index, field] = issue.path;
    if (typeof index === "number" && field === "label") errors[index] ??= issue.message;
  }
  return errors;
}

/** Whether the dialog holds changes worth saving (options, their colours, or row colouring). */
export function isChanged(
  list: LookupList | undefined,
  options: EditorOption[],
  tintRows = list?.tintRows ?? false,
): boolean {
  const original = list?.options ?? [];
  return (
    tintRows !== (list?.tintRows ?? false) ||
    original.length !== options.length ||
    options.some(
      (option, i) =>
        option.id !== original[i].id ||
        option.label.trim() !== original[i].label ||
        option.color !== original[i].color,
    )
  );
}
