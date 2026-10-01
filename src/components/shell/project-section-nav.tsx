"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useReducer, useRef } from "react";
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
    "px-3 text-sm font-medium whitespace-nowrap",
    "transition-colors duration-(--duration-fast) select-none cursor-pointer",
    active || open
      ? "bg-accent text-on-accent hover:bg-accent-strong"
      : "text-ink-muted hover:text-ink hover:bg-surface-raised",
  ].join(" ");

const linkClass = (current: boolean) =>
  [
    "block px-4 py-2.5 text-sm whitespace-nowrap",
    "first:rounded-t-lg last:rounded-b-lg",
    "transition-colors duration-(--duration-fast)",
    current
      ? "text-ink font-medium bg-accent-soft"
      : "text-ink-muted hover:text-ink hover:bg-surface-raised",
  ].join(" ");

// ---------------------------------------------------------------------------
// Chevron icon
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
      className={`transition-transform duration-(--duration-fast) ${open ? "rotate-180" : ""}`}
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
  onClose,
}: {
  group: ProjectSectionGroup;
  projectId: number;
  pathname: string;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const active = isGroupActive(pathname, projectId, group);
  const panelId = `section-group-${group.key}`;

  // Groups with no built sections are omitted entirely (no dead links).
  if (group.sections.length === 0) return null;

  // A group with only one section that is the charter index renders as a
  // plain link — no disclosure needed.
  if (group.sections.length === 1 && group.sections[0]?.segment === ".") {
    const section = group.sections[0];
    const current = isCurrentSection(pathname, projectId, section);
    return (
      <li className="shrink-0">
        <Link
          href={sectionHref(projectId, section)}
          aria-current={current ? "page" : undefined}
          className={pillClass(current, false)}
        >
          {section.label}
        </Link>
      </li>
    );
  }

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

      {open ? (
        <div
          id={panelId}
          role="group"
          aria-label={group.label}
          className="absolute left-0 top-full z-(--z-dropdown) mt-1 min-w-44 rounded-lg border border-line bg-surface shadow-lg"
        >
          {group.sections.map((section) => {
            const current = isCurrentSection(pathname, projectId, section);
            return (
              <Link
                key={section.segment}
                href={sectionHref(projectId, section)}
                aria-current={current ? "page" : undefined}
                className={linkClass(current)}
                onClick={onClose}
              >
                {section.label}
              </Link>
            );
          })}
        </div>
      ) : null}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Reducer for open/close state per group key
// ---------------------------------------------------------------------------

type OpenState = Record<string, boolean>;
type OpenAction = { type: "toggle"; key: string } | { type: "reset"; activeKey: string | null };

function openReducer(state: OpenState, action: OpenAction): OpenState {
  switch (action.type) {
    case "toggle": {
      const next: OpenState = {};
      for (const k of Object.keys(state)) next[k] = false;
      next[action.key] = !state[action.key];
      return next;
    }
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
 * Project section navigation (ADR-0018): four group disclosure buttons
 * (Overview · Planning · People · Activity), each toggling a dropdown panel
 * of section links. Replaces the flat scrollable pill row — groups keep the
 * nav compact as more sections are added.
 *
 * ARIA disclosure pattern: buttons are aria-expanded, panels are role="group".
 * The active group's panel opens on mount; route changes re-evaluate which
 * group is active and reset the rest.
 */
export function ProjectSectionNav({ projectId }: { projectId: number }) {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);

  const [openState, dispatch] = useReducer(
    openReducer,
    null,
    () => initialOpenState(pathname, projectId),
  );

  // Resync the active group when the route or project changes (the reducer
  // initializer runs only on first mount; this component is persistent across
  // navigations within the project layout).
  useEffect(() => {
    const activeKey =
      projectSectionGroups.find((g) => isGroupActive(pathname, projectId, g))?.key ?? null;
    dispatch({ type: "reset", activeKey });
  }, [pathname, projectId]);

  // Close all panels on outside click.
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (!navRef.current?.contains(e.target as Node)) {
        dispatch({ type: "reset", activeKey: null });
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  return (
    <nav
      ref={navRef}
      aria-label={messages.projects.sectionsNav}
      data-testid="project-section-nav"
      className="-mx-4 border-b border-line"
    >
      <ul className="flex gap-1 overflow-x-auto px-4 py-2">
        {projectSectionGroups.map((group) => (
          <GroupPill
            key={group.key}
            group={group}
            projectId={projectId}
            pathname={pathname}
            open={!!openState[group.key]}
            onToggle={() => dispatch({ type: "toggle", key: group.key })}
            onClose={() => dispatch({ type: "reset", activeKey: null })}
          />
        ))}
      </ul>
    </nav>
  );
}
