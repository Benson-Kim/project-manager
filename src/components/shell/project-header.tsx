"use client";

import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
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
  const pathname = usePathname();
  const router = useRouter();
  const selectedProject = options.find((option) => option.id === projectId) ?? null;
  const [query, setQuery] = useState(selectedProject?.name ?? "");
  const [open, setOpen] = useState(false);
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
    router.push(nextPath);
  }

  return (
    <div data-testid="project-header" className="relative min-w-0 flex-1 max-w-xl">
      <label htmlFor="project-switcher" className="sr-only">
        {messages.projects.jumpToProject}
      </label>
      <input
        id="project-switcher"
        role="combobox"
        aria-controls="project-switcher-options"
        aria-expanded={open}
        aria-label={messages.projects.jumpToProject}
        autoComplete="off"
        className="min-h-11 w-full rounded-full border border-line bg-surface px-4 pr-11 text-base font-medium text-ink"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 100)}
      />
      <button
        type="button"
        aria-label={messages.projects.jumpToProject}
        aria-expanded={open}
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
        id="project-switcher-options"
        role="listbox"
        hidden={!open}
        className="absolute z-(--z-dialog) mt-1 max-h-60 w-full overflow-auto rounded-xl border border-line bg-surface-raised py-1 shadow-lg"
      >
        {filtered.map((option) => (
          <li key={option.id} role="option" aria-selected={option.id === projectId}>
            <button
              type="button"
              className={`flex w-full items-center px-4 py-2 text-left text-sm ${
                option.id === projectId
                  ? "bg-accent-soft text-accent"
                  : "text-ink hover:bg-surface-sunken"
              }`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectProject(option.id)}
            >
              {option.name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
