"use client";

import { useId, useState } from "react";
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
  const listId = useId();
  const linked = action.WbsLinksJson.map((link) => link.KeyDeliverableId);
  const labelOf = (id: number) => taskOptions.find((option) => option.id === id)?.label ?? `#${id}`;
  const needle = filter.trim().toLowerCase();
  const shown = needle
    ? taskOptions.filter((option) => option.label.toLowerCase().includes(needle))
    : taskOptions;

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
          className="rounded-full border border-line px-2 py-0.5 text-xs text-ink wrap-anywhere"
          data-testid="action-task-chip"
        >
          {labelOf(id)}
        </span>
      ))}
      {taskOptions.length > 0 ? (
        <div className="relative print:hidden">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={listId}
            aria-label={M.tasksOf(name)}
            className="rounded-md border border-line px-2 py-0.5 text-xs text-ink hover:bg-surface-sunken"
            onClick={() => setOpen((value) => !value)}
          >
            {M.tasks}
          </button>
          {open ? (
            <fieldset
              id={listId}
              aria-label={M.tasksOf(name)}
              className="absolute z-20 mt-1 flex w-72 flex-col rounded-md border border-line bg-surface shadow-md"
            >
              <input
                type="search"
                value={filter}
                aria-label={messages.list.search}
                placeholder={messages.list.search}
                onChange={(event) => setFilter(event.target.value)}
                className="rounded-t-md border-b border-line bg-surface px-3 py-2 text-sm text-ink"
              />
              <div className="flex max-h-64 flex-col overflow-y-auto">
                {shown.map((option) => (
                  <label
                    key={option.id}
                    className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-ink last:rounded-b-md hover:bg-surface-sunken"
                  >
                    <input
                      type="checkbox"
                      checked={linked.includes(option.id)}
                      aria-disabled={busy || undefined}
                      onChange={() => toggle(option.id)}
                    />
                    <span className="wrap-anywhere">{option.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
