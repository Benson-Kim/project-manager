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
    <span className="inline-flex h-7 max-w-full items-center gap-0.5 rounded-full border border-line bg-surface-raised pr-0.5 pl-2.5 text-xs text-ink">
      <input type="hidden" name={inputName} value={id} />
      <span className="truncate">{label}</span>
      {!disabled && (
        <button
          type="button"
          aria-label={removeLabel(label)}
          className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-sm text-ink-muted hover:bg-surface hover:text-danger focus-visible:outline-2 focus-visible:outline-focus"
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
  const fieldRef = useRef<HTMLDivElement>(null);
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
  // Placed against the whole field, so a panel that opens upwards sits above the chips and every
  // chosen item stays in reach of its ×.
  usePopoverPlacement(fieldRef, listRef, open && filtered.length > 0, {
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
    } else if (e.key === "Backspace" && query === "" && selected.length > 0) {
      onRemove(selected[selected.length - 1].id);
    } else if (e.key === "Escape") {
      if (open) {
        e.stopPropagation();
        setOpen(false);
      }
    }
  };

  return (
    <div ref={fieldRef} className="relative">
      {/* The chips sit inside the box, before the text, like an e-mail's recipients. */}
      <div
        className={`flex min-h-11 flex-wrap items-center gap-1.5 rounded-md border border-line px-2 py-1 ${disabled ? "bg-surface-sunken" : "bg-surface"} focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-focus`}
        onMouseDown={(e) => {
          if (e.target !== e.currentTarget) return;
          e.preventDefault();
          inputRef.current?.focus();
        }}
      >
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
        {!disabled && (
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
            className="min-h-8 min-w-24 flex-1 bg-transparent px-1 text-sm text-ink"
            // The box draws the focus ring; the global :focus-visible rule is unlayered, so only an
            // inline style keeps the input from drawing a second one inside it.
            style={{ outline: "none" }}
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
        )}
      </div>
      {!disabled && (
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          hidden={!open || filtered.length === 0}
          className="fixed z-(--z-dropdown) max-h-60 overflow-auto rounded-md border border-line bg-surface-raised shadow-lg"
        >
          {ranked.map(({ option, rank }, idx) => (
            <li
              key={option.id}
              id={`${listboxId}-${option.id}`}
              role="option"
              aria-selected={false}
              className={`flex min-h-11 cursor-pointer items-center px-3 text-sm first:rounded-t-md last:rounded-b-md ${
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
      )}
    </div>
  );
}
