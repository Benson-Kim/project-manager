"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useListUrlState } from "@/components/ui/data-view/use-list-url-state";
import { Select } from "@/components/ui/form/inputs";
import { Toolbar } from "@/components/ui/toolbar";
import { messages } from "@/lib/messages";
import { searchProjectsAction } from "../actions";
import type { ProjectSearchRow } from "../schemas/project";
import { PROJECT_PRIORITIES, PROJECT_STATUSES } from "../schemas/project-form";

/**
 * Projects toolbar: the search input doubles as the type-ahead jump-to-project
 * combobox (req 0.1/0.2 — suggestions from usp_Project_Search from the first
 * character; Enter filters the list; picking a suggestion opens the project).
 * Status/priority filters forward 1:1 to usp_Project_List.
 */
export function ProjectsToolbar({ children }: { children?: React.ReactNode }) {
  const router = useRouter();
  const { searchParams, update } = useListUrlState();
  const listboxId = useId();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [suggestions, setSuggestions] = useState<ProjectSearchRow[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestSeq = useRef(0);

  const fetchSuggestions = useCallback(async (prefix: string) => {
    const seq = ++requestSeq.current;
    const result = await searchProjectsAction({ prefix });
    if (seq !== requestSeq.current) return; // stale response
    if (result.ok) {
      setSuggestions(result.data);
      setOpen(result.data.length > 0);
      setActiveIndex(0);
    }
  }, []);

  useEffect(() => () => clearTimeout(debounceRef.current ?? undefined), []);

  const onChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      update({ q: value || null });
      if (value.trim()) void fetchSuggestions(value.trim());
      else {
        setSuggestions([]);
        setOpen(false);
      }
    }, 250);
  };

  const jumpTo = (row: ProjectSearchRow) => {
    setOpen(false);
    router.push(`/projects/${row.ProjectId}`);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (open) setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
      else if (suggestions.length > 0) setOpen(true);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      if (open && suggestions[activeIndex]) {
        event.preventDefault();
        jumpTo(suggestions[activeIndex]);
      }
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <Toolbar>
      <div className="relative min-w-0 flex-1">
        <label>
          <span className="sr-only">{messages.list.search}</span>
          <input
            type="search"
            role="combobox"
            aria-expanded={open}
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-activedescendant={
              open && suggestions[activeIndex]
                ? `${listboxId}-${suggestions[activeIndex].ProjectId}`
                : undefined
            }
            autoComplete="off"
            placeholder={messages.list.search}
            data-testid="projects-search"
            className="min-h-10 w-full rounded-md border border-line bg-surface px-3 text-sm text-ink"
            value={query}
            onChange={(e) => onChange(e.target.value)}
            onBlur={() => setTimeout(() => setOpen(false), 100)}
            onKeyDown={onKeyDown}
          />
        </label>
      </div>
      <label>
        <span className="sr-only">{messages.projects.status}</span>
        <Select
          name="status"
          data-testid="filter-status"
          value={searchParams.get("status") ?? ""}
          onChange={(e) => update({ status: e.target.value || null })}
          className="w-auto"
        >
          <option value="">{messages.projects.allStatuses}</option>
          {PROJECT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      </label>
      <label>
        <span className="sr-only">{messages.projects.priority}</span>
        <Select
          name="priority"
          data-testid="filter-priority"
          value={searchParams.get("priority") ?? ""}
          onChange={(e) => update({ priority: e.target.value || null })}
          className="w-auto"
        >
          <option value="">{messages.projects.allPriorities}</option>
          {PROJECT_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </Select>
      </label>
      {children}
    </Toolbar>
  );
}
