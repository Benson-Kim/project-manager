"use client";

/**
 * Global dropdown-list configuration system (ADR-0012).
 *
 * Provides a React context that stores mutable option lists for any
 * column that has a `dropdownKey`.  Lists are seeded with module-supplied
 * defaults and persisted in localStorage so changes survive navigation
 * without a round-trip.
 *
 * Public surface:
 *   <DropdownListConfigProvider defaults={…}>   — wrap the module view
 *   useDropdownOptions(key)                      — read current options
 *   DropdownListConfigModal                      — triggered from a header caret
 */

import {
  createContext,
  useCallback,
  useContext,
  useId,
  useRef,
  useState,
} from "react";
import * as RadixDialog from "@radix-ui/react-dialog";
import { messages } from "@/lib/messages";

// ---------------------------------------------------------------------------
// Context & store
// ---------------------------------------------------------------------------

type OptionLists = Record<string, string[]>;

interface DropdownListConfigCtx {
  /** Get the current (possibly user-edited) option list for a key. */
  getOptions: (key: string) => string[];
  /** Replace the option list for a key. */
  setOptions: (key: string, options: string[]) => void;
  /** Defaults registered by the provider — used to seed on first load. */
  defaults: OptionLists;
}

const DropdownListConfigContext = createContext<DropdownListConfigCtx | null>(null);

const STORAGE_KEY_PREFIX = "dropdown-list-config-v1";

/** Storage key scoped per module so two modules with the same dropdownKey never collide. */
function storageKey(moduleKey?: string): string {
  return moduleKey ? `${STORAGE_KEY_PREFIX}:${moduleKey}` : STORAGE_KEY_PREFIX;
}

function loadFromStorage(key: string): OptionLists {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    return JSON.parse(raw) as OptionLists;
  } catch {
    return {};
  }
}

function saveToStorage(key: string, lists: OptionLists): void {
  try {
    localStorage.setItem(key, JSON.stringify(lists));
  } catch {
    // quota exceeded or private mode — silently ignore
  }
}

/** Wrap a module's view tree to register dropdown defaults. */
export function DropdownListConfigProvider({
  moduleKey,
  defaults,
  children,
}: {
  /**
   * Scope key — use the same value as DataView's `moduleKey` prop.
   * Scopes localStorage so different modules with the same dropdownKey
   * (e.g. "status") never overwrite each other's option lists.
   */
  moduleKey?: string;
  defaults: OptionLists;
  children: React.ReactNode;
}) {
  const key = storageKey(moduleKey);

  const [lists, setLists] = useState<OptionLists>(() => {
    const persisted = loadFromStorage(key);
    // Merge: persisted wins for any key that was already customised; new keys
    // from defaults are seeded in.
    const merged: OptionLists = { ...defaults };
    for (const k of Object.keys(persisted)) {
      if (Array.isArray(persisted[k]) && persisted[k].length > 0) {
        merged[k] = persisted[k];
      }
    }
    return merged;
  });

  const getOptions = useCallback(
    (k: string): string[] => lists[k] ?? defaults[k] ?? [],
    [lists, defaults],
  );

  const setOptions = useCallback(
    (k: string, options: string[]) => {
      setLists((prev) => {
        const next = { ...prev, [k]: options };
        saveToStorage(key, next);
        return next;
      });
    },
    [key],
  );

  return (
    <DropdownListConfigContext.Provider value={{ getOptions, setOptions, defaults }}>
      {children}
    </DropdownListConfigContext.Provider>
  );
}

/** Read the current option list for a dropdown key. Returns [] when no provider. */
export function useDropdownOptions(key: string | undefined): string[] {
  const ctx = useContext(DropdownListConfigContext);
  if (!ctx || !key) return [];
  return ctx.getOptions(key);
}

/**
 * Returns a stable resolver function `(key) => string[]` that can be called
 * for any number of dropdown keys at render time without violating the Rules
 * of Hooks. DataView uses this to pass live options to renderEdit / renderInput
 * across all columns in a single hook call.
 *
 * The returned function is re-created whenever the context's `getOptions`
 * reference changes (i.e. whenever any option list is saved), so all call
 * sites receive fresh options immediately after the modal saves.
 */
export function useDropdownResolver(): (key: string | undefined) => string[] {
  const ctx = useContext(DropdownListConfigContext);
  // Depend on ctx.getOptions explicitly so the resolver is replaced whenever
  // the provider's lists change (after the user saves the config modal).
  const getOptions = ctx?.getOptions;
  return useCallback(
    (key: string | undefined): string[] => {
      if (!getOptions || !key) return [];
      return getOptions(key);
    },
    [getOptions],
  );
}

function useDropdownListConfigCtx() {
  return useContext(DropdownListConfigContext);
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

interface DropdownListConfigModalProps {
  /** The column's dropdownKey. */
  dropdownKey: string;
  /** Display label for the modal title (e.g. "Status"). */
  columnHeader: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Modal for editing a dropdown column's option list.
 * Rendered from the DataView header caret; consumes DropdownListConfigContext.
 */
export function DropdownListConfigModal({
  dropdownKey,
  columnHeader,
  open,
  onOpenChange,
}: DropdownListConfigModalProps) {
  const ctx = useDropdownListConfigCtx();

  // If no provider is present, lazy-initialise with an empty list.
  // The early return at line ~255 (after all hooks) prevents a render.
  const [draftOptions, setDraftOptions] = useState<string[]>(() =>
    ctx ? ctx.getOptions(dropdownKey) : [],
  );

  // No re-sync effect needed: DataView unmounts this modal when `configModal`
  // is null (i.e. when closed), so the lazy useState initialiser above runs
  // fresh on every open. Any programmatic option changes while the modal is
  // open are reflected immediately via ctx.getOptions in the initialiser.
  const [newValue, setNewValue] = useState("");
  const newInputRef = useRef<HTMLInputElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  const onOpenAutoFocus = useCallback(() => {
    openerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }, []);

  const onCloseAutoFocus = useCallback((e: Event) => {
    e.preventDefault();
    openerRef.current?.focus();
    openerRef.current = null;
  }, []);

  const handleRename = (index: number, value: string) => {
    setDraftOptions((prev) => prev.map((o, i) => (i === index ? value : o)));
  };

  const handleDelete = (index: number) => {
    setDraftOptions((prev) => prev.filter((_, i) => i !== index));
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    setDraftOptions((prev) => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  };

  const handleMoveDown = (index: number) => {
    setDraftOptions((prev) => {
      if (index >= prev.length - 1) return prev;
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
  };

  const handleAddNew = () => {
    const trimmed = newValue.trim();
    if (!trimmed) return;
    setDraftOptions((prev) => [...prev, trimmed]);
    setNewValue("");
    newInputRef.current?.focus();
  };

  if (!ctx) return null;

  const handleSave = () => {
    // filter by trimmed length — removes whitespace-only entries while
    // preserving legitimate values like "0" or "false".
    ctx.setOptions(dropdownKey, draftOptions.filter((opt) => opt.trim().length > 0));
    onOpenChange(false);
  };

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-(--z-dialog) bg-black/50" />
        <RadixDialog.Content
          onOpenAutoFocus={onOpenAutoFocus}
          onCloseAutoFocus={onCloseAutoFocus}
          className="fixed top-1/2 left-1/2 z-(--z-dialog) w-[calc(100vw-2rem)] max-w-[460px] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-line bg-surface p-5 shadow-xl"
        >
          <RadixDialog.Title className="pr-11 text-base font-semibold text-ink">
            {messages.dropdownConfig.editTitle(columnHeader)}
          </RadixDialog.Title>
          <RadixDialog.Close
            aria-label={messages.actions.close}
            className="absolute top-3 right-3 flex size-11 items-center justify-center rounded-md text-ink-muted hover:bg-surface-sunken"
          >
            <svg viewBox="0 0 16 16" className="size-4" fill="none" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </RadixDialog.Close>

          <div className="mt-4 flex flex-col gap-1">
            {draftOptions.length === 0 ? (
              <p className="text-sm text-ink-muted">{messages.dropdownConfig.noOptions}</p>
            ) : (
              draftOptions.map((opt, idx) => (
                <OptionRow
                  // Index-only key: the list is small, ordering is managed
                  // by move-up/move-down, and duplicate values are allowed.
                  key={idx}
                  value={opt}
                  isFirst={idx === 0}
                  isLast={idx === draftOptions.length - 1}
                  onChange={(v) => handleRename(idx, v)}
                  onDelete={() => handleDelete(idx)}
                  onMoveUp={() => handleMoveUp(idx)}
                  onMoveDown={() => handleMoveDown(idx)}
                />
              ))
            )}
          </div>

          {/* Add new row */}
          <div className="mt-3 flex gap-2">
            <input
              ref={newInputRef}
              type="text"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddNew();
                }
              }}
              placeholder={messages.dropdownConfig.addPlaceholder}
              className="min-h-9 flex-1 rounded-md border border-line bg-surface px-3 text-sm text-ink placeholder:text-ink-muted focus:outline-2 focus:outline-focus"
            />
            <button
              type="button"
              onClick={handleAddNew}
              className="min-h-9 rounded-md border border-line bg-surface px-3 text-sm font-medium text-ink hover:bg-surface-sunken"
            >
              {messages.dropdownConfig.addNew}
            </button>
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <RadixDialog.Close asChild>
              <button
                type="button"
                className="min-h-9 rounded-md border border-line px-4 text-sm font-medium text-ink hover:bg-surface-sunken"
              >
                {messages.actions.cancel}
              </button>
            </RadixDialog.Close>
            <button
              type="button"
              onClick={handleSave}
              className="min-h-9 rounded-md bg-accent px-4 text-sm font-medium text-white hover:bg-accent/90"
            >
              {messages.actions.save}
            </button>
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

// ---------------------------------------------------------------------------
// OptionRow
// ---------------------------------------------------------------------------

function OptionRow({
  value,
  isFirst,
  isLast,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  value: string;
  isFirst: boolean;
  isLast: boolean;
  onChange: (v: string) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const inputId = useId();
  return (
    <div className="flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-1">
      {/* Reorder */}
      <div className="flex flex-col">
        <button
          type="button"
          aria-label={messages.dropdownConfig.moveUp}
          disabled={isFirst}
          onClick={onMoveUp}
          className="flex size-5 items-center justify-center text-ink-muted disabled:opacity-30 hover:text-ink"
        >
          <svg viewBox="0 0 10 6" className="size-2.5" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <path d="M1 5l4-4 4 4" />
          </svg>
        </button>
        <button
          type="button"
          aria-label={messages.dropdownConfig.moveDown}
          disabled={isLast}
          onClick={onMoveDown}
          className="flex size-5 items-center justify-center text-ink-muted disabled:opacity-30 hover:text-ink"
        >
          <svg viewBox="0 0 10 6" className="size-2.5" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <path d="M1 1l4 4 4-4" />
          </svg>
        </button>
      </div>

      {/* Inline text edit */}
      <input
        id={inputId}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-8 flex-1 bg-transparent px-1 text-sm text-ink focus:outline-none"
      />

      {/* Delete */}
      <button
        type="button"
        aria-label={messages.dropdownConfig.deleteOption(value)}
        onClick={onDelete}
        className="flex size-8 items-center justify-center rounded text-ink-muted hover:text-danger"
      >
        <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <path d="M4 4l8 8M12 4l-8 8" />
        </svg>
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cell render helpers — reusable across all modules
// ---------------------------------------------------------------------------

/**
 * Builds a `renderEdit` function for a column that should display a live
 * `<select>` populated from the DropdownListConfigContext.
 *
 * Usage in a module's column definition:
 *   renderEdit: makeDropdownRenderEdit((row) => row.Status ?? ""),
 *
 * The `options` argument is injected by DataView from the context so the
 * select always reflects whatever the user has configured in the modal.
 * A blank first option lets the user clear the field.
 */
export function makeDropdownRenderEdit<Row>(
  /** Extract the column's current string value from the row. */
  getValue: (row: Row) => string,
): (row: Row, onChange: (value: string) => void, options: string[]) => React.ReactNode {
  return function DropdownEditCell(row, onChange, options) {
    const currentValue = getValue(row);
    // If the row's current value is not in the option list (e.g. the option
    // was deleted after data was saved), show it as a labelled stale entry so
    // the user knows the data still exists and can choose a replacement.
    const valueInOptions = options.includes(currentValue);
    return (
      <select
        value={currentValue}
        onChange={(e) => onChange(e.target.value)}
        className="h-full w-full border-0 bg-transparent px-3 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
      >
        <option value="" />
        {!valueInOptions && currentValue ? (
          // Render the stale value so the select isn't blank; visually marked.
          <option value={currentValue}>{currentValue} ⚠</option>
        ) : null}
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    );
  };
}

/**
 * Builds a `renderInput` function for a column that should display a live
 * `<select>` in the inline add-row guide row.
 *
 * Usage in a module's column definition:
 *   renderInput: makeDropdownRenderInput("Select status…"),
 *
 * The `options` argument is injected by InlineAddRow from the context.
 * A blank first option serves as the placeholder / empty state.
 */
export function makeDropdownRenderInput(
  placeholder?: string,
): (props: {
  value: string;
  onChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  options: string[];
}) => React.ReactNode {
  return function DropdownInputCell({ value, onChange, onKeyDown, options }) {
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        className="h-full w-full border-0 bg-transparent px-3 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
      >
        <option value="">{placeholder ?? ""}</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    );
  };
}
