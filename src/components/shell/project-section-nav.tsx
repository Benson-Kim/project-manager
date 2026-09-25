"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useReducer } from "react";
import { messages } from "@/lib/messages";
import {
  isCurrentSection,
  isGroupActive,
  projectSectionGroups,
  sectionHref,
  type ProjectSectionGroup,
} from "./project-sections";

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const pillClass = (active: boolean, open: boolean) =>
  [
    "relative inline-flex min-h-10 items-center gap-1",
    "rounded-md px-3 text-sm font-medium whitespace-nowrap",
    "transition-colors duration-fast select-none",
    active || open ? "text-ink bg-surface-raised" : "text-ink-muted hover:text-ink hover:bg-surface-raised",
  ].join(" ");

const linkClass = (current: boolean) =>
  [
    "block px-3 py-2 text-sm rounded-md whitespace-nowrap",
    "transition-colors duration-fast",
    current ? "text-ink font-medium bg-surface-raised" : "text-ink-muted hover:text-ink hover:bg-surface-raised",
  ].join(" ");

// ---------------------------------------------------------------------------
// Chevron icon (inline SVG — no icon package dependency per ADR-0014)
// ---------------------------------------------------------------------------

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={["transition-transform duration-fast", open ? "rotate-180" : ""].join(" ")}
    >
      <polyline points="2,4 6,8 10,4" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Group pill + disclosure panel
// ---------------------------------------------------------------------------

function GroupPill({
  group,
  projectId,
  pathname,
  open,
  onToggle,
}: {
  group: ProjectSectionGroup;
  projectId: number;
  pathname: string;
  open: boolean;
  onToggle: () => void;
}) {
  const active = isGroupActive(pathname, projectId, group);
  const panelId = `section-group-${group.key}`;

  // Groups with no built sections are omitted entirely (no dead links)
  if (group.sections.length === 0) return null;

  return (
    <li className="relative shrink-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className={pillClass(active, open)}
      >
        {group.label}
        <Chevron open={open} />
      </button>

      {open && (
        <div
          id={panelId}
          role="group"
          aria-label={group.label}
          className={[
            "absolute left-0 top-full z-20 mt-1",
            "min-w-40 rounded-lg border border-border bg-canvas shadow-md",
            "py-1",
          ].join(" ")}
        >
          {group.sections.map((section) => {
            const current = isCurrentSection(pathname, projectId, section);
            return (
              <Link
                key={section.segment}
                href={sectionHref(projectId, section)}
                aria-current={current ? "page" : undefined}
                className={linkClass(current)}
              >
                {section.label}
              </Link>
            );
          })}
        </div>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Reducer for open/close state per group key
// ---------------------------------------------------------------------------

type OpenState = Record<string, boolean>;

type OpenAction =
  | { type: "toggle"; key: string }
  | { type: "reset"; activeKey: string | null };

function openReducer(state: OpenState, action: OpenAction): OpenState {
  switch (action.type) {
    case "toggle":
      return { ...state, [action.key]: !state[action.key] };
    case "reset": {
      const next: OpenState = {};
      for (const k of Object.keys(state)) next[k] = false;
      if (action.activeKey) next[action.activeKey] = true;
      return next;
    }
  }
}

function initialOpenState(pathname: string, projectId: number): OpenState {
  const state: OpenState = {};
  for (const group of projectSectionGroups) {
    state[group.key] = isGroupActive(pathname, projectId, group);
  }
  return state;
}

// ---------------------------------------------------------------------------
// Main nav component
// ---------------------------------------------------------------------------

/**
 * Project section navigation (ADR-0018 updated): four group disclosure buttons,
 * each toggling a panel of section links. ARIA disclosure pattern — buttons are
 * aria-expanded, panels are role="group". The active group's panel opens on
 * mount; route changes re-evaluate which group is active.
 * Client component only for the open/close + active-link state.
 */
export function ProjectSectionNav({ projectId }: { projectId: number }) {
  const pathname = usePathname();

  const [openState, dispatch] = useReducer(
    openReducer,
    null,
    () => initialOpenState(pathname, projectId),
  );

  // When the route changes (e.g. user clicks a section link), open the active
  // group's panel and close the rest so the nav reflects the current location.
  useEffect(() => {
    const activeKey =
      projectSectionGroups.find((g) => isGroupActive(pathname, projectId, g))?.key ?? null;
    dispatch({ type: "reset", activeKey });
  }, [pathname, projectId]);

  return (
    <nav
      aria-label={messages.projects.sectionsNav}
      data-testid="project-section-nav"
      className="-mx-4"
    >
      <ul className="flex gap-1 overflow-x-auto px-4 py-2 scrollbar-none mask-[linear-gradient(to_right,transparent,black_16px,black_calc(100%-16px),transparent)]">
        {projectSectionGroups.map((group) => (
          <GroupPill
            key={group.key}
            group={group}
            projectId={projectId}
            pathname={pathname}
            open={!!openState[group.key]}
            onToggle={() => dispatch({ type: "toggle", key: group.key })}
          />
        ))}
      </ul>
    </nav>
  );
}
