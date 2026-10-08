"use client";

/**
 * TableSizeConfig — Access/Excel-style row height + column width controls.
 *
 * Provides:
 *   useTableSizeConfig(moduleKey, columns)   — hook; returns sizes + setters
 *   TableSizeConfigButton                    — settings gear button + popover panel
 *
 * Persistence: all sizes are stored in localStorage under
 *   "table-size-config-v1:<moduleKey>"
 * so the user's preferences survive navigation without a server round-trip.
 *
 * Presets:
 *   Compact  → rowHeight 32px  / colWidth 120px
 *   Default  → rowHeight 44px  / colWidth 160px
 *   Spacious → rowHeight 64px  / colWidth 200px
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { messages } from "@/lib/messages";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TableSizeState {
  /** Row height in px applied to every data row. */
  rowHeight: number;
  /** Default column width in px; used for columns without an explicit override. */
  defaultColWidth: number;
  /** Per-column pixel width overrides, keyed by column key. */
  colWidths: Record<string, number>;
}

interface StoredSizeState {
  rowHeight?: number;
  defaultColWidth?: number;
  colWidths?: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

export const SIZE_PRESETS = [
  { label: messages.tableSize.compact,  rowHeight: 32,  defaultColWidth: 120 },
  { label: messages.tableSize.default,  rowHeight: 44,  defaultColWidth: 160 },
  { label: messages.tableSize.spacious, rowHeight: 64,  defaultColWidth: 200 },
] as const;

const FALLBACK_PRESET = SIZE_PRESETS[1]; // Default

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

function storageKey(moduleKey: string) {
  return `table-size-config-v1:${moduleKey}`;
}

function loadSizes(moduleKey: string): StoredSizeState {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(storageKey(moduleKey));
    if (!raw) return {};
    return JSON.parse(raw) as StoredSizeState;
  } catch {
    return {};
  }
}

function saveSizes(moduleKey: string, state: TableSizeState) {
  try {
    localStorage.setItem(storageKey(moduleKey), JSON.stringify(state));
  } catch {
    // quota exceeded / private mode — silent
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseTableSizeConfig {
  rowHeight: number;
  defaultColWidth: number;
  colWidths: Record<string, number>;
  /** Resolved width for a specific column (colWidths override or defaultColWidth). */
  resolvedWidth: (colKey: string) => number | undefined;
  setRowHeight: (h: number) => void;
  setDefaultColWidth: (w: number) => void;
  setColWidth: (colKey: string, width: number) => void;
  /** Remove a single per-column override so that column falls back to defaultColWidth. */
  deleteColWidth: (colKey: string) => void;
  applyPreset: (preset: (typeof SIZE_PRESETS)[number]) => void;
  /** Reset ALL column overrides (clears every per-column entry). */
  resetColWidths: () => void;
  /** Current active preset label, or null if custom. */
  activePreset: string | null;
}

export function useTableSizeConfig(
  moduleKey: string,
  /** Optional row height seed — used only if no stored preference exists. */
  initialRowHeight?: number,
): UseTableSizeConfig {
  const [state, setState] = useState<TableSizeState>(() => {
    const stored = loadSizes(moduleKey);
    return {
      rowHeight: stored.rowHeight ?? initialRowHeight ?? FALLBACK_PRESET.rowHeight,
      defaultColWidth: stored.defaultColWidth ?? FALLBACK_PRESET.defaultColWidth,
      colWidths: stored.colWidths ?? {},
    };
  });

  // Persist after a short debounce so rapid changes (e.g. dragging a column
  // border pixel-by-pixel) don't hammer localStorage on every frame.
  useEffect(() => {
    const timer = setTimeout(() => {
      saveSizes(moduleKey, state);
    }, 300);
    return () => clearTimeout(timer);
  }, [moduleKey, state]);

  const setRowHeight = useCallback((h: number) => {
    setState((prev) => ({ ...prev, rowHeight: Math.max(24, Math.min(120, h)) }));
  }, []);

  const setDefaultColWidth = useCallback((w: number) => {
    setState((prev) => ({ ...prev, defaultColWidth: Math.max(48, Math.min(600, w)) }));
  }, []);

  const setColWidth = useCallback((colKey: string, width: number) => {
    setState((prev) => ({
      ...prev,
      colWidths: { ...prev.colWidths, [colKey]: Math.max(48, Math.min(600, width)) },
    }));
  }, []);

  const applyPreset = useCallback((preset: (typeof SIZE_PRESETS)[number]) => {
    setState((prev) => ({
      rowHeight: preset.rowHeight,
      defaultColWidth: preset.defaultColWidth,
      colWidths: prev.colWidths, // keep per-column overrides
    }));
  }, []);

  const resetColWidths = useCallback(() => {
    setState((prev) => ({ ...prev, colWidths: {} }));
  }, []);

  /** Remove a single column override so it falls back to defaultColWidth. */
  const deleteColWidth = useCallback((colKey: string) => {
    setState((prev) => {
      const next = { ...prev.colWidths };
      delete next[colKey];
      return { ...prev, colWidths: next };
    });
  }, []);

  const activePreset =
    SIZE_PRESETS.find(
      (p) => p.rowHeight === state.rowHeight && p.defaultColWidth === state.defaultColWidth,
    )?.label ?? null;

  const resolvedWidth = useCallback(
    (colKey: string) =>
      state.colWidths[colKey] !== undefined ? state.colWidths[colKey] : undefined,
    [state.colWidths],
  );

  return {
    ...state,
    resolvedWidth,
    setRowHeight,
    setDefaultColWidth,
    setColWidth,
    deleteColWidth,
    applyPreset,
    resetColWidths,
    activePreset,
  };
}

// ---------------------------------------------------------------------------
// TableSizeConfigButton — gear icon that opens the popover panel
// ---------------------------------------------------------------------------

interface TableSizeConfigButtonProps {
  config: UseTableSizeConfig;
  /** Column definitions — shown in the per-column overrides section. */
  columnHeaders: { key: string; label: string }[];
}

export function TableSizeConfigButton({ config, columnHeaders }: TableSizeConfigButtonProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  // Close on outside click/focus.
  useEffect(() => {
    if (!open) return;
    const handler = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [open]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false);
      triggerRef.current?.focus();
    }
  };

  return (
    <div
      ref={rootRef}
      className="relative"
      onBlur={(e) => {
        if (!rootRef.current?.contains(e.relatedTarget as Node)) setOpen(false);
      }}
      onKeyDown={handleKeyDown}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label={messages.tableSize.configureLabel}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className={`flex size-11 items-center justify-center rounded-md border border-line text-ink-muted hover:bg-surface-sunken ${open ? "bg-surface-sunken text-ink" : ""}`}
      >
        {/* Gear icon */}
        <svg viewBox="0 0 20 20" className="size-4" fill="currentColor" aria-hidden="true">
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z"
          />
        </svg>
      </button>

      <div
        id={panelId}
        role="dialog"
        aria-label={messages.tableSize.configureLabel}
        hidden={!open}
        className="absolute right-0 top-full z-(--z-dropdown) mt-1 w-72 rounded-lg border border-line bg-surface p-4 shadow-xl"
      >
        <SizeConfigPanel config={config} columnHeaders={columnHeaders} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SizeConfigPanel — the content inside the popover
// ---------------------------------------------------------------------------

function SizeConfigPanel({
  config,
  columnHeaders,
}: {
  config: UseTableSizeConfig;
  columnHeaders: { key: string; label: string }[];
}) {
  const [showColOverrides, setShowColOverrides] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      {/* ── Presets ─────────────────────────────────────────────────────── */}
      <section aria-labelledby="size-presets-label">
        <p id="size-presets-label" className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
          {messages.tableSize.presets}
        </p>
        <div className="flex gap-1.5">
          {SIZE_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              aria-pressed={config.activePreset === preset.label}
              onClick={() => config.applyPreset(preset)}
              className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${
                config.activePreset === preset.label
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line bg-surface text-ink hover:bg-surface-sunken"
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </section>

      {/* ── Row height ──────────────────────────────────────────────────── */}
      <SizeInput
        label={messages.tableSize.rowHeight}
        value={config.rowHeight}
        min={24}
        max={120}
        onChange={config.setRowHeight}
        unit="px"
      />

      {/* ── Default column width ────────────────────────────────────────── */}
      <SizeInput
        label={messages.tableSize.columnWidth}
        value={config.defaultColWidth}
        min={48}
        max={600}
        onChange={config.setDefaultColWidth}
        unit="px"
      />

      {/* ── Per-column overrides ────────────────────────────────────────── */}
      {columnHeaders.length > 0 ? (
        <section>
          <button
            type="button"
            onClick={() => setShowColOverrides((v) => !v)}
            className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wide text-ink-muted"
          >
            {messages.tableSize.columnOverrides}
            <svg
              viewBox="0 0 10 6"
              className={`size-2.5 transition-transform ${showColOverrides ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden="true"
            >
              <path d="M1 1l4 4 4-4" />
            </svg>
          </button>

          {showColOverrides ? (
            <div className="mt-2 flex flex-col gap-2">
              {columnHeaders.map(({ key, label }) => (
                <ColOverrideRow
                  key={key}
                  colKey={key}
                  label={label}
                  config={config}
                />
              ))}
              <button
                type="button"
                onClick={config.resetColWidths}
                className="mt-1 self-start text-xs text-ink-muted underline underline-offset-2 hover:text-ink"
              >
                {messages.tableSize.resetAll}
              </button>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function ColOverrideRow({
  colKey,
  label,
  config,
}: {
  colKey: string;
  label: string;
  config: UseTableSizeConfig;
}) {
  const currentOverride = config.colWidths[colKey];
  const displayValue = currentOverride ?? config.defaultColWidth;

  return (
    <div className="flex items-center gap-2">
      <span className="min-w-0 flex-1 truncate text-xs text-ink">{label}</span>
      <SizeInput
        label={label}
        hideLabel
        value={displayValue}
        min={48}
        max={600}
        onChange={(v) => config.setColWidth(colKey, v)}
        unit="px"
        compact
      />
      {currentOverride !== undefined ? (
        <button
          type="button"
          aria-label={messages.tableSize.resetColumn(label)}
          onClick={() => config.deleteColWidth(colKey)}
          className="shrink-0 text-xs text-ink-muted underline underline-offset-2 hover:text-ink"
        >
          ↺
        </button>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SizeInput — labelled numeric input with +/- stepper buttons
// ---------------------------------------------------------------------------

function SizeInput({
  label,
  hideLabel,
  value,
  min,
  max,
  onChange,
  unit,
  compact,
}: {
  label: string;
  hideLabel?: boolean;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  unit?: string;
  compact?: boolean;
}) {
  const inputId = useId();

  const clamp = (v: number) => Math.max(min, Math.min(max, v));

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const n = parseInt(e.target.value, 10);
    if (!isNaN(n)) onChange(clamp(n));
  };

  return (
    <div className={`flex ${compact ? "" : "flex-col gap-1"} ${compact ? "items-center gap-1" : ""}`}>
      {!hideLabel ? (
        <label htmlFor={inputId} className="text-xs font-medium text-ink">
          {label}
        </label>
      ) : (
        <label htmlFor={inputId} className="sr-only">
          {label}
        </label>
      )}
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label={messages.tableSize.decrease(label)}
          onClick={() => onChange(clamp(value - 4))}
          disabled={value <= min}
          className="flex size-7 items-center justify-center rounded border border-line text-sm text-ink-muted hover:bg-surface-sunken disabled:opacity-40"
        >
          −
        </button>
        <div className="relative flex items-center">
          <input
            id={inputId}
            type="number"
            min={min}
            max={max}
            value={value}
            onChange={handleChange}
            className="h-7 w-16 rounded border border-line bg-surface px-2 text-center text-xs text-ink [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          {unit ? (
            <span className="pointer-events-none absolute right-2 text-xs text-ink-muted">
              {unit}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          aria-label={messages.tableSize.increase(label)}
          onClick={() => onChange(clamp(value + 4))}
          disabled={value >= max}
          className="flex size-7 items-center justify-center rounded border border-line text-sm text-ink-muted hover:bg-surface-sunken disabled:opacity-40"
        >
          +
        </button>
      </div>
    </div>
  );
}
