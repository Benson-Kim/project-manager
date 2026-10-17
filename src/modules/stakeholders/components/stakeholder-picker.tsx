"use client";

import { useCallback, useId, useMemo, useRef, useState } from "react";
import { useFieldContext } from "@/components/ui/form/field";
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
    <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-raised px-2.5 py-0.5 text-xs text-ink">
      <input type="hidden" name={inputName} value={id} />
      {name}
      {!disabled && (
        <button
          type="button"
          aria-label={removeLabel(name)}
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
 * The shared stakeholder picker (ADR-0001: meetings and key deliverables use
 * it): type to filter the project's stakeholders, pick to add a chip. Each
 * chip submits a hidden `inputName` entry. It follows the ARIA combobox
 * pattern of the shared single-select Combobox.
 */
export function StakeholderMultiSelect({
  options,
  selected,
  disabled,
  inputName,
  removeLabel,
  emptyPlaceholder,
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
  onAdd: (opt: StakeholderOption) => void;
  onRemove: (id: number) => void;
}) {
  const listboxId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const fieldCtx = useFieldContext();

  const selectedIds = useMemo(() => new Set(selected.map((s) => s.id)), [selected]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return options.filter(
      (o) => !selectedIds.has(o.stakeholderId) && (!q || o.name.toLowerCase().includes(q)),
    );
  }, [options, query, selectedIds]);

  const pick = useCallback(
    (opt: StakeholderOption) => {
      onAdd(opt);
      setQuery("");
      setActiveIndex(0);
      inputRef.current?.focus();
    },
    [onAdd],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) setOpen(true);
      else setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (open && filtered[activeIndex]) {
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
            <StakeholderChip
              key={s.id}
              id={s.id}
              name={s.name}
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
              open && filtered[activeIndex]
                ? `${listboxId}-${filtered[activeIndex].stakeholderId}`
                : undefined
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
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 100)}
            onKeyDown={onKeyDown}
          />
          <ul
            id={listboxId}
            role="listbox"
            hidden={!open || filtered.length === 0}
            className="absolute z-(--z-dialog) mt-1 max-h-60 w-full overflow-auto rounded-md border border-line bg-surface-raised py-1 shadow-lg"
          >
            {filtered.map((opt, idx) => (
              <li
                key={opt.stakeholderId}
                id={`${listboxId}-${opt.stakeholderId}`}
                role="option"
                aria-selected={false}
                className={`flex min-h-11 cursor-pointer items-center px-3 text-sm ${
                  idx === activeIndex ? "bg-accent-soft text-ink" : "text-ink"
                }`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(opt);
                }}
                onMouseEnter={() => setActiveIndex(idx)}
              >
                {opt.name}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
