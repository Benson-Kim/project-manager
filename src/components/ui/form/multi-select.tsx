"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { usePopoverPlacement } from "../popover-placement";
import { useFieldContext } from "./field";
import { NO_MATCH, rankByMatch } from "./rank-options";

export interface MultiSelectOption {
  id: number;
  label: string;
}

/** A picked option; its hidden input carries the id in the form's data. */
export function ChipTag({
  id,
  label,
  inputName,
  removeLabel,
  disabled,
  onRemove,
}: {
  id: number;
  label: string;
  inputName: string;
  removeLabel: (label: string) => string;
  disabled: boolean;
  onRemove: (id: number) => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-raised px-2.5 py-0.5 text-xs text-ink">
      <input type="hidden" name={inputName} value={id} />
      {label}
      {!disabled && (
        <button
          type="button"
          aria-label={removeLabel(label)}
          className="ml-0.5 inline-flex min-h-[44px] min-w-[44px] items-center justify-center text-ink-muted hover:text-danger focus-visible:outline-2 focus-visible:outline-focus"
          onClick={() => onRemove(id)}
        >
          ×
        </button>
      )}
    </span>
  );
}

/**
 * Type to filter, pick to add a chip; each chip submits a hidden `inputName`
 * entry. The ARIA combobox pattern of the shared single-select Combobox.
 */
export function MultiSelect({
  options,
  selected,
  disabled,
  inputName,
  removeLabel,
  emptyPlaceholder,
  autoFocus = false,
  onAdd,
  onRemove,
}: {
  options: readonly MultiSelectOption[];
  selected: readonly MultiSelectOption[];
  disabled: boolean;
  inputName: string;
  removeLabel: (label: string) => string;
  /** Shown in the input when there is nothing to pick. */
  emptyPlaceholder: string;
  /** Put the caret in the field once it is on screen (a command that opens a form on it). */
  autoFocus?: boolean;
  onAdd: (option: MultiSelectOption) => void;
  onRemove: (id: number) => void;
}) {
  const listboxId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  // Enter takes an option the text does not match only once the arrows chose it.
  const keyedRef = useRef(false);
  const fieldCtx = useFieldContext();

  const selectedIds = useMemo(() => new Set(selected.map((s) => s.id)), [selected]);

  // A frame later, not on mount: a dialog focuses its first field as it opens,
  // which would otherwise land after this and take the caret away.
  useEffect(() => {
    if (!autoFocus) return;
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [autoFocus]);

  const ranked = useMemo(
    () =>
      rankByMatch(
        options.filter((o) => !selectedIds.has(o.id)),
        query,
        (o) => o.label,
      ),
    [options, query, selectedIds],
  );
  const filtered = ranked.map((r) => r.option);
  const up = usePopoverPlacement(inputRef, listRef, open && filtered.length > 0, {
    fit: true,
    contentKey: filtered.length,
  });

  // The panel closes on each pick: its options take mousedown, so left open it swallows a click
  // aimed at whatever sits under the field (a sheet's Save). Click, typing or ↓ brings it back.
  const pick = useCallback(
    (option: MultiSelectOption) => {
      onAdd(option);
      setQuery("");
      setActiveIndex(0);
      setOpen(false);
      inputRef.current?.focus();
    },
    [onAdd],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      keyedRef.current = true;
      if (!open) setOpen(true);
      else setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      keyedRef.current = true;
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      const active = ranked[activeIndex];
      if (open && active && (keyedRef.current || active.rank < NO_MATCH)) {
        e.preventDefault();
        pick(filtered[activeIndex]);
      }
    } else if (e.key === "Escape") {
      if (open) {
        e.stopPropagation();
        setOpen(false);
      }
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((s) => (
            <ChipTag
              key={s.id}
              id={s.id}
              label={s.label}
              inputName={inputName}
              removeLabel={removeLabel}
              disabled={disabled}
              onRemove={onRemove}
            />
          ))}
        </div>
      )}
      {!disabled && (
        <div className="relative">
          <input
            ref={inputRef}
            id={fieldCtx?.inputId}
            role="combobox"
            aria-expanded={open}
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-activedescendant={
              open && filtered[activeIndex] ? `${listboxId}-${filtered[activeIndex].id}` : undefined
            }
            aria-invalid={fieldCtx?.invalid || undefined}
            aria-describedby={fieldCtx?.invalid ? fieldCtx.errorId : undefined}
            autoComplete="off"
            placeholder={options.length === 0 ? emptyPlaceholder : ""}
            className="min-h-11 w-full rounded-md border border-line bg-surface px-3 text-sm text-ink"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
              setActiveIndex(0);
              keyedRef.current = false;
            }}
            onFocus={() => setOpen(true)}
            onClick={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 100)}
            onKeyDown={onKeyDown}
          />
          <ul
            ref={listRef}
            id={listboxId}
            role="listbox"
            hidden={!open || filtered.length === 0}
            className={`absolute z-(--z-dropdown) ${up ? "bottom-full mb-1" : "mt-1"} max-h-60 w-full overflow-auto rounded-md border border-line bg-surface-raised py-1 shadow-lg`}
          >
            {ranked.map(({ option, rank }, idx) => (
              <li
                key={option.id}
                id={`${listboxId}-${option.id}`}
                role="option"
                aria-selected={false}
                className={`flex min-h-11 cursor-pointer items-center px-3 text-sm ${
                  idx === activeIndex ? "bg-accent-soft" : ""
                } ${rank < NO_MATCH ? "text-ink" : "text-ink-muted"}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(option);
                }}
                onMouseEnter={() => setActiveIndex(idx)}
              >
                {option.label}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
