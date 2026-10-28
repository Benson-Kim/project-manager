"use client";

import { useCallback, useId, useMemo, useRef, useState } from "react";
import { Chevron } from "../chevron";
import { usePopoverPlacement } from "../popover-placement";
import { useFieldAria } from "./field";
import { NO_MATCH, rankByMatch } from "./rank-options";

/**
 * Minimal ARIA 1.2 combobox : text input + filtered listbox popup.
 * Keyboard complete (↑ ↓ Enter Esc), aria-activedescendant pattern, verified
 * by axe on /kitchen-sink. The selected value is submitted through a hidden
 * input so it participates in FormData like every native control. The arrow
 * is always shown, like a select's, and reopening after a choice lists every
 * option again.
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
  /**
   * Makes the box "pick one, or type a name": text that matches no option is
   * submitted under this second field name instead of being thrown away. The
   * two hidden inputs are exclusive — a pick clears the typed name and a typed
   * name clears the pick — so the row behind them can hold the same rule.
   */
  freeTextName?: string;
  /** The typed name to start with, when the stored value was free text. */
  defaultFreeText?: string;
}

export function Combobox({
  name,
  options,
  defaultValue,
  onSelect,
  ariaLabel,
  placeholder,
  inCell = false,
  freeTextName,
  defaultFreeText,
}: ComboboxProps) {
  const listboxId = useId();
  const aria = useFieldAria();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  // Enter takes an option the text does not match only once the arrows chose it.
  const keyedRef = useRef(false);
  const initial = options.find((o) => o.value === defaultValue) ?? null;
  const [selected, setSelected] = useState<ComboboxOption | null>(initial);
  const [query, setQuery] = useState(initial?.label ?? defaultFreeText ?? "");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const ranked = useMemo(
    () => rankByMatch(options, query === selected?.label ? "" : query, (o) => o.label),
    [options, query, selected],
  );
  const filtered = ranked.map((r) => r.option);
  const up = usePopoverPlacement(inputRef, listRef, open && filtered.length > 0, {
    fit: true,
    contentKey: filtered.length,
  });

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
      keyedRef.current = true;
      if (!open) setOpen(true);
      else setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      keyedRef.current = true;
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      const active = ranked[activeIndex];
      if (open && active && (keyedRef.current || active.rank < NO_MATCH)) {
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
      {freeTextName ? (
        <input type="hidden" name={freeTextName} value={selected ? "" : query.trim()} />
      ) : null}
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
        className={`min-h-10 w-full pr-8 text-sm text-ink placeholder:text-ink-muted aria-invalid:border-danger ${inCell ? "border-0 bg-transparent pl-2" : "rounded-md border border-line bg-surface pl-3"}`}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActiveIndex(0);
          keyedRef.current = false;
          if (selected && e.target.value !== selected.label) {
            setSelected(null);
            onSelect?.(null);
          }
        }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onBlur={() => {
          // Allow option mousedown to win over blur-close; text that picked
          // nothing goes back to the current choice.
          setTimeout(() => {
            setOpen(false);
            setQuery(selected?.label ?? "");
          }, 100);
        }}
        onKeyDown={onKeyDown}
        {...aria}
      />
      <span className="pointer-events-none absolute right-3 top-0 flex h-10 items-center text-ink-muted">
        <Chevron open={open && filtered.length > 0} />
      </span>
      <ul
        ref={listRef}
        id={listboxId}
        role="listbox"
        hidden={!open || filtered.length === 0}
        className={`absolute z-(--z-dropdown) ${up ? "bottom-full mb-1" : "mt-1"} max-h-60 w-full overflow-auto rounded-md border border-line bg-surface-raised py-1 shadow-lg`}
      >
        {ranked.map(({ option, rank }, index) => (
          <li
            key={option.value}
            id={`${listboxId}-${option.value}`}
            role="option"
            aria-selected={selected?.value === option.value}
            className={`flex min-h-10 cursor-pointer items-center px-6 text-sm ${
              index === activeIndex ? "bg-accent-soft" : ""
            } ${rank < NO_MATCH ? "text-ink" : "text-ink-muted"}`}
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
