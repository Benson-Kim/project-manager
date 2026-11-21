"use client";

import { useEffect, useId, useRef, useState } from "react";
import { messages } from "@/lib/messages";
import type { WorkspaceActionItem } from "../schemas/meeting";
import { useMinutes } from "./minutes-context";

const M = messages.meetings;

/**
 * The WBS tasks an action is about: a chip per linked task and a "Tasks" list
 * to tick or untick them. A task the list no longer offers keeps its link.
 */
export function ActionTaskLinks({ action, name }: { action: WorkspaceActionItem; name: string }) {
  const { busy, taskOptions, setTaskLinks } = useMinutes();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const linked = action.WbsLinksJson.map((link) => link.KeyDeliverableId);
  const labelOf = (id: number) => taskOptions.find((option) => option.id === id)?.label ?? `#${id}`;
  const needle = filter.trim().toLowerCase();
  const shown = needle
    ? taskOptions.filter((option) => option.label.toLowerCase().includes(needle))
    : taskOptions;

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const toggle = (id: number) => {
    if (busy) return;
    const next = linked.includes(id) ? linked.filter((value) => value !== id) : [...linked, id];
    setTaskLinks(action, next, name);
  };

  if (linked.length === 0 && taskOptions.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="action-task-links">
      {linked.map((id) => (
        <span
          key={id}
          className="group inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50/70 px-2 py-0.5 text-xs text-sky-800 wrap-anywhere transition-colors hover:border-sky-300"
        >
          <span data-testid="action-task-chip" className="font-medium">
            {labelOf(id)}
          </span>
          <button
            type="button"
            aria-label={`Unlink ${labelOf(id)}`}
            disabled={busy}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              toggle(id);
            }}
            className="rounded p-0.5 text-sky-400 hover:text-danger hover:bg-surface-soft text-xs leading-none transition-colors"
            title="Unlink"
          >
            ×
          </button>
        </span>
      ))}

      {taskOptions.length > 0 ? (
        <div className="print:hidden">
          <button
            ref={buttonRef}
            type="button"
            aria-expanded={open}
            aria-controls={listId}
            aria-label={M.tasksOf(name)}
            className="inline-flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-0.5 text-xs font-medium text-ink transition-colors hover:bg-surface-soft shadow-xs"
            onClick={() => setOpen((value) => !value)}
          >
            + {M.tasks}
          </button>

          {open ? (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs"
              role="presentation"
              onClick={(e) => {
                if (e.target === e.currentTarget) setOpen(false);
              }}
            >
              <div
                ref={dialogRef}
                id={listId}
                role="dialog"
                aria-modal="true"
                aria-label={M.tasksOf(name)}
                className="flex w-full max-w-lg flex-col rounded-xl border border-line bg-surface p-5 shadow-2xl animate-in fade-in zoom-in-95 duration-150"
              >
                <div className="flex items-center justify-between pb-3 border-b border-line">
                  <div>
                    <h4 className="text-sm font-semibold text-ink">{M.tasksOf(name)}</h4>
                    <p className="text-xs text-ink-muted mt-0.5">
                      Link WBS deliverable tasks to this action item.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-md p-1.5 text-ink-muted hover:bg-surface-raised hover:text-ink transition-colors"
                    aria-label="Close"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="pt-3 pb-2">
                  <input
                    ref={searchRef}
                    type="search"
                    value={filter}
                    aria-label={messages.list.search}
                    placeholder="Search tasks..."
                    onChange={(event) => setFilter(event.target.value)}
                    className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </div>

                <fieldset className="flex max-h-72 flex-col overflow-y-auto divide-y divide-line/60 rounded-lg border border-line p-1">
                  <legend className="sr-only">{M.tasksOf(name)}</legend>
                  {shown.length === 0 ? (
                    <p className="px-3 py-4 text-center text-xs text-ink-muted">No tasks match.</p>
                  ) : (
                    shown.map((option) => {
                      const isTicked = linked.includes(option.id);
                      return (
                        <label
                          key={option.id}
                          className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm text-ink transition-colors ${
                            isTicked ? "bg-sky-50/70 text-sky-900 font-medium" : "hover:bg-surface-soft"
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <input
                              type="checkbox"
                              checked={isTicked}
                              aria-disabled={busy || undefined}
                              onChange={() => toggle(option.id)}
                              className="h-4 w-4 rounded border-line text-accent focus:ring-accent shrink-0"
                            />
                            <span className="truncate">{option.label}</span>
                          </div>
                          {isTicked ? (
                            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-700 shrink-0">
                              Linked
                            </span>
                          ) : null}
                        </label>
                      );
                    })
                  )}
                </fieldset>

                <div className="flex justify-end pt-3 mt-3 border-t border-line">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-lg bg-surface-raised border border-line px-4 py-2 text-xs font-medium text-ink hover:bg-surface-sunken transition-colors"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
