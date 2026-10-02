"use client";

import { useId, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { messages } from "@/lib/messages";

export interface ProjectOption {
  id: number;
  name: string;
}

export function ProjectHeader({
  projectId,
  options,
}: {
  projectId: number;
  options: ProjectOption[];
}) {
  const listboxId = useId();
  const pathname = usePathname();
  const router = useRouter();
  const selectedProject = options.find((option) => option.id === projectId) ?? null;
  const [query, setQuery] = useState(selectedProject?.name ?? "");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalized
      ? options.filter((option) => option.name.toLowerCase().includes(normalized))
      : options;
  }, [options, query]);

  function selectProject(nextProjectId: number) {
    const currentPrefix = `/projects/${projectId}`;
    const nextPath = pathname.startsWith(`${currentPrefix}/`)
      ? `/projects/${nextProjectId}${pathname.slice(currentPrefix.length)}`
      : `/projects/${nextProjectId}`;
    setQuery(options.find((option) => option.id === nextProjectId)?.name ?? "");
    setOpen(false);
    setActiveIndex(0);
    router.push(nextPath);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
      } else {
        setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
      }
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      if (open && filtered[activeIndex]) {
        event.preventDefault();
        selectProject(filtered[activeIndex].id);
      }
    } else if (event.key === "Escape") {
      if (open) {
        event.stopPropagation();
        setOpen(false);
        setActiveIndex(0);
      }
    }
  }

  return (
    <div data-testid="project-header" className="relative min-w-0 flex-1 max-w-xl">
      <label htmlFor="project-switcher" className="sr-only">
        {messages.projects.jumpToProject}
      </label>
      <input
        id="project-switcher"
        role="combobox"
        aria-controls={listboxId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-autocomplete="list"
        aria-activedescendant={
          open && filtered[activeIndex]
            ? `${listboxId}-${filtered[activeIndex].id}`
            : undefined
        }
        aria-label={messages.projects.jumpToProject}
        autoComplete="off"
        className="min-h-11 w-full rounded-full border border-line bg-surface px-4 pr-11 text-base font-medium text-ink"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActiveIndex(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // Allow option mousedown to win over blur-close (same guard as Combobox).
          setTimeout(() => setOpen(false), 100);
        }}
        onKeyDown={onKeyDown}
      />
      <button
        type="button"
        aria-label={messages.projects.jumpToProject}
        aria-expanded={open}
        tabIndex={-1}
        className="absolute top-1/2 right-2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-ink-muted hover:bg-surface-sunken"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen((current) => !current)}
      >
        <svg viewBox="0 0 24 24" className="size-4" fill="none" aria-hidden="true">
          <path
            d="m6 9 6 6 6-6"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <ul
        id={listboxId}
        role="listbox"
        hidden={!open}
        className="absolute z-(--z-dropdown) mt-1 max-h-60 w-full overflow-auto rounded-xl border border-line bg-surface-raised py-1 shadow-lg"
      >
        {filtered.map((option, index) => (
          <li
            key={option.id}
            id={`${listboxId}-${option.id}`}
            role="option"
            aria-selected={option.id === projectId}
            className={`flex min-h-11 cursor-pointer items-center px-4 text-sm ${
              index === activeIndex ? "bg-accent-soft text-ink" : "text-ink hover:bg-surface-sunken"
            }`}
            onMouseDown={(event) => event.preventDefault()}
            onMouseEnter={() => setActiveIndex(index)}
            onClick={() => selectProject(option.id)}
          >
            {option.name}
          </li>
        ))}
      </ul>
    </div>
  );
}
