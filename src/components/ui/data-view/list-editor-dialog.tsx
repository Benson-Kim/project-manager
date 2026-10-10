"use client";

import { useId, useState, useTransition } from "react";
import {
  LOOKUP_LABEL_MAX,
  OPTION_COLORS,
  type LookupListKey,
  type OptionColor,
} from "@/lib/lookup-lists";
import { messages } from "@/lib/messages";
import { useAnnouncer } from "../announcer";
import { Button } from "../button";
import { Dialog } from "../dialog";
import { ErrorSummary } from "../form/error-summary";
import { useLookupLists } from "../lookup-lists";
import { useToast } from "../toast";
import { TONES } from "../tones";
import { IconButton } from "./datasheet-cells";
import {
  addOption,
  editorOptions,
  isChanged,
  moveOption,
  optionErrors,
  recolorOption,
  removeOption,
  renameOption,
  toSaveInput,
  type EditorOption,
} from "./list-editor-state";

/**
 * "Edit dropdown list: <column>" (client feedback §4, ADR-0022), opened from a
 * datasheet header caret or "Edit list…" in a cell's dropdown. Rename options
 * in place, colour them, move them, remove them, add new ones, and choose
 * whether rows take their value's colour (migration 020); Save sends the whole
 * list (dbo.usp_LookupList_Set) and every select on the page shows the new
 * options at once (LookupListsProvider). Locked options — labels the app reads —
 * can be moved and coloured but not renamed or removed.
 */
export function ListEditorDialog({
  listKey,
  column,
  open,
  onOpenChange,
}: {
  listKey: LookupListKey;
  /** The column header, used in the title. */
  column: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={messages.lookupLists.edit(column)}>
      {open ? (
        <ListEditor listKey={listKey} column={column} onDone={() => onOpenChange(false)} />
      ) : null}
    </Dialog>
  );
}

function ListEditor({
  listKey,
  column,
  onDone,
}: {
  listKey: LookupListKey;
  column: string;
  onDone: () => void;
}) {
  const { lists, save } = useLookupLists();
  const list = lists[listKey];
  const rowVer = list?.rowVer ?? 0;
  const [options, setOptions] = useState<EditorOption[]>(() => editorOptions(list));
  const [tintRows, setTintRows] = useState(list?.tintRows ?? false);
  const [newLabel, setNewLabel] = useState("");
  const [added, setAdded] = useState(0);
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { toast } = useToast();
  const { announce } = useAnnouncer();
  const newId = useId();
  const tintId = useId();
  const errors = optionErrors(listKey, rowVer, options);
  const invalid = Object.keys(errors).length > 0;

  const add = () => {
    setOptions((current) => addOption(current, newLabel, `n${added}`));
    setAdded((n) => n + 1);
    setNewLabel("");
  };

  const submit = () => {
    if (invalid) return;
    if (!isChanged(list, options, tintRows)) {
      onDone();
      return;
    }
    startTransition(async () => {
      const result = await save(toSaveInput(listKey, rowVer, options, tintRows));
      if (result.ok) {
        announce(messages.lookupLists.saved(column));
        toast({ variant: "success", title: messages.lookupLists.saved(column) });
        onDone();
      } else {
        setServerError(result.error.message);
      }
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <ErrorSummary message={serverError} />

      {options.length === 0 ? (
        <p className="text-sm text-ink-muted">{messages.lookupLists.empty}</p>
      ) : (
        <ol className="flex flex-col gap-2" data-testid="list-editor-options">
          {options.map((option, index) => (
            <OptionRow
              key={option.key}
              option={option}
              position={index + 1}
              error={errors[index]}
              first={index === 0}
              last={index === options.length - 1}
              onRename={(label) => setOptions((current) => renameOption(current, index, label))}
              onRecolor={(color) => setOptions((current) => recolorOption(current, index, color))}
              onMove={(delta) => setOptions((current) => moveOption(current, index, delta))}
              onRemove={() => setOptions((current) => removeOption(current, index))}
            />
          ))}
        </ol>
      )}

      <div className="flex items-end gap-2">
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor={newId} className="text-sm leading-6 text-ink">
            {messages.lookupLists.newOption}
          </label>
          <input
            id={newId}
            value={newLabel}
            maxLength={LOOKUP_LABEL_MAX}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            className="min-h-10 w-full rounded-md border border-line bg-surface px-3 text-sm text-ink"
          />
        </div>
        <Button variant="secondary" onClick={add} disabled={!newLabel.trim()}>
          <PlusIcon />
          {messages.lookupLists.addNew}
        </Button>
      </div>

      <div className="flex items-start gap-2">
        <input
          id={tintId}
          type="checkbox"
          checked={tintRows}
          onChange={(e) => setTintRows(e.target.checked)}
          aria-describedby={`${tintId}-hint`}
          className="mt-1 size-5"
        />
        <div className="flex flex-col">
          <label htmlFor={tintId} className="text-sm leading-6 text-ink">
            {messages.lookupLists.tintRows}
          </label>
          <p id={`${tintId}-hint`} className="text-xs text-ink-muted">
            {messages.lookupLists.tintRowsHint}
          </p>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>
          {messages.actions.cancel}
        </Button>
        <Button onClick={submit} pending={pending} disabled={invalid}>
          {messages.actions.save}
        </Button>
      </div>
    </div>
  );
}

function OptionRow({
  option,
  position,
  error,
  first,
  last,
  onRename,
  onRecolor,
  onMove,
  onRemove,
}: {
  option: EditorOption;
  position: number;
  error: string | undefined;
  first: boolean;
  last: boolean;
  onRename: (label: string) => void;
  onRecolor: (color: OptionColor | null) => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
}) {
  const errorId = useId();
  const name = option.label.trim() || messages.lookupLists.option(position);
  // The name shows in its colour, as the cells and badges will.
  const tone = option.color ? `${TONES[option.color].fill} font-medium` : "";
  return (
    <li className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <input
          value={option.label}
          readOnly={option.locked}
          maxLength={LOOKUP_LABEL_MAX}
          aria-label={messages.lookupLists.option(position)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(e) => onRename(e.target.value)}
          className={`min-h-10 min-w-0 flex-1 rounded-md border border-line px-3 text-sm aria-invalid:border-danger ${tone || "bg-surface text-ink read-only:bg-surface-raised"}`}
        />
        {option.locked ? (
          <span className="px-1 text-xs font-medium text-ink-muted">
            {messages.lookupLists.locked}
          </span>
        ) : null}
        <select
          aria-label={messages.lookupLists.color(name)}
          value={option.color ?? ""}
          onChange={(e) => onRecolor((e.target.value || null) as OptionColor | null)}
          className={`min-h-10 w-28 shrink-0 rounded-md border border-line px-2 text-sm ${tone || "bg-surface text-ink"}`}
        >
          <option value="">{messages.lookupLists.noColor}</option>
          {OPTION_COLORS.map((color) => (
            <option key={color} value={color}>
              {messages.lookupLists.colors[color]}
            </option>
          ))}
        </select>
        <IconButton
          label={messages.lookupLists.moveUp(name)}
          disabled={first}
          onClick={() => onMove(-1)}
        >
          <path d="M4 10l4-4 4 4" />
        </IconButton>
        <IconButton
          label={messages.lookupLists.moveDown(name)}
          disabled={last}
          onClick={() => onMove(1)}
        >
          <path d="M4 6l4 4 4-4" />
        </IconButton>
        {option.locked ? null : (
          <IconButton label={messages.lookupLists.remove(name)} onClick={onRemove}>
            <path d="M4 4l8 8M12 4l-8 8" />
          </IconButton>
        )}
      </div>
      {error ? (
        <p id={errorId} className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </li>
  );
}

function PlusIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path d="M8 3v10M3 8h10" />
    </svg>
  );
}
