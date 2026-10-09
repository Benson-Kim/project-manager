"use client";

import { useCallback, useId, useMemo, useRef, useState } from "react";
import { useFieldAria } from "./field";

/**
 * Minimal ARIA 1.2 combobox : text input + filtered listbox popup.
 * Keyboard complete (↑ ↓ Enter Esc), aria-activedescendant pattern, verified
 * by axe on /kitchen-sink. The selected value is submitted through a hidden
 * input so it participates in FormData like every native control.
 */
export interface ComboboxOption {
  value: string;
  label: string;
}

export interface ComboboxProps {
  name: string;
  options: ComboboxOption[];
  defaultValue?: string;
  onSelect?: (option: ComboboxOption | null) => void;
  /** Accessible name when there is no surrounding <Field> label (e.g. a grid cell). */
  ariaLabel?: string;
  placeholder?: string;
  /** Borderless, to fill a bordered grid cell (the team grid's new-member row). */
  inCell?: boolean;
}

export function Combobox({
  name,
  options,
  defaultValue,
  onSelect,
  ariaLabel,
  placeholder,
  inCell = false,
}: ComboboxProps) {
  const listboxId = useId();
  const aria = useFieldAria();
  const inputRef = useRef<HTMLInputElement>(null);
  const initial = options.find((o) => o.value === defaultValue) ?? null;
  const [selected, setSelected] = useState<ComboboxOption | null>(initial);
  const [query, setQuery] = useState(initial?.label ?? "");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  const select = useCallback(
    (option: ComboboxOption | null) => {
      setSelected(option);
      setQuery(option?.label ?? "");
      setOpen(false);
      onSelect?.(option);
    },
    [onSelect],
  );

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) setOpen(true);
      else setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      if (open && filtered[activeIndex]) {
        event.preventDefault();
        select(filtered[activeIndex]);
      }
    } else if (event.key === "Escape") {
      if (open) {
        event.stopPropagation();
        setOpen(false);
      }
    }
  };

  return (
    <div className="relative">
      <input type="hidden" name={name} value={selected?.value ?? ""} />
      <input
        ref={inputRef}
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={
          open && filtered[activeIndex] ? `${listboxId}-${filtered[activeIndex].value}` : undefined
        }
        autoComplete="off"
        aria-label={ariaLabel}
        placeholder={placeholder}
        className={`min-h-10 w-full text-sm text-ink placeholder:text-ink-muted aria-invalid:border-danger ${inCell ? "border-0 bg-transparent px-2" : "rounded-md border border-line bg-surface px-3"}`}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActiveIndex(0);
          if (selected && e.target.value !== selected.label) {
            setSelected(null);
            onSelect?.(null);
          }
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // Allow option mousedown to win over blur-close.
          setTimeout(() => setOpen(false), 100);
        }}
        onKeyDown={onKeyDown}
        {...aria}
      />
      <ul
        id={listboxId}
        role="listbox"
        hidden={!open || filtered.length === 0}
        className="absolute z-(--z-dropdown) mt-1 max-h-60 w-full overflow-auto rounded-md border border-line bg-surface-raised py-1 shadow-lg"
      >
        {filtered.map((option, index) => (
          <li
            key={option.value}
            id={`${listboxId}-${option.value}`}
            role="option"
            aria-selected={selected?.value === option.value}
            className={`flex min-h-10 cursor-pointer items-center px-6 text-sm ${
              index === activeIndex ? "bg-accent-soft text-ink" : "text-ink"
            }`}
            onMouseDown={(e) => {
              e.preventDefault();
              select(option);
            }}
            onMouseEnter={() => setActiveIndex(index)}
          >
            {option.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
