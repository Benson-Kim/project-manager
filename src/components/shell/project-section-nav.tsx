"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useReducer } from "react";
import { messages } from "@/lib/messages";
import {
  isCurrentSection,
  isGroupActive,
  projectSectionGroups,
  sectionHref,
  type ProjectSectionGroup,
} from "./project-sections";


// active = current route is inside this group (drives the accent border)
// open   = dropdown is visible (drives bg only, not the border)
const tabClass = (active: boolean, open: boolean) =>
  [
    "relative inline-flex min-h-10 items-center gap-1.5",
    "px-4 text-sm font-medium whitespace-nowrap select-none cursor-pointer",
    "border-b-2 transition-colors duration-fast",
    active
      ? "border-accent text-ink bg-surface-raised"
      : open
        ? "border-transparent text-ink bg-surface-raised"
        : "border-transparent text-ink-muted hover:text-ink hover:bg-surface-raised",
  ].join(" ");

const linkClass = (current: boolean) =>
  [
    "block px-4 py-2.5 text-sm whitespace-nowrap",
    "transition-colors duration-fast",
    current
      ? "text-ink font-medium bg-surface-raised"
      : "text-ink-muted hover:text-ink hover:bg-surface-raised",
  ].join(" ");

// ---------------------------------------------------------------------------
// Chevron icon (inline SVG — no icon package, ADR-0014)
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
      className={["shrink-0 transition-transform duration-fast", open ? "rotate-180" : ""].join(" ")}
    >
      <polyline points="2,4 6,8 10,4" />
    </svg>
  );
}

/** Rendered outside the scrolling <ul> so overflow clipping never hides it. */
function GroupDropdown({
  group,
  projectId,
  pathname,
  open,
  anchorRef,
}: {
  group: ProjectSectionGroup;
  projectId: number;
  pathname: string;
  open: boolean;
  anchorRef: React.RefObject<HTMLLIElement | null>;
}) {
  const panelId = `section-group-${group.key}`;
  if (!open || group.sections.length === 0) return null;

  // Position relative to the <nav> (position:relative). offsetLeft gives the
  // left edge of the <li> within its offset parent; offsetHeight gives the tab
  // strip height so the panel opens directly below.
  const el = anchorRef.current;
  const left = el?.offsetLeft ?? 0;
  const top = el?.offsetTop != null && el?.offsetHeight != null
    ? el.offsetTop + el.offsetHeight
    : 40; // fallback: typical tab height

  return (
    <div
      id={panelId}
      role="group"
      aria-label={group.label}
      style={{ position: "absolute", top, left, zIndex: 50 }}
      className="min-w-44 border border-border bg-canvas shadow-lg py-1"
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
  );
}

// ---------------------------------------------------------------------------
// Reducer for open/close state per group key
// ---------------------------------------------------------------------------

type OpenState = Record<string, boolean>;
type OpenAction =
  | { type: "toggle"; key: string }
  | { type: "close-all" }
  | { type: "reset"; activeKey: string | null };

function openReducer(state: OpenState, action: OpenAction): OpenState {
  switch (action.type) {
    case "toggle":
      // Close all others, toggle the target
      return Object.fromEntries(
        Object.keys(state).map((k) => [k, k === action.key ? !state[k] : false]),
      );
    case "close-all":
      return Object.fromEntries(Object.keys(state).map((k) => [k, false]));
    case "reset": {
      return Object.fromEntries(
        Object.keys(state).map((k) => [k, k === action.activeKey]),
      );
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
 * Project section navigation (ADR-0018 updated): four group tabs with a
 * bottom-border active indicator and a dropdown panel of section links.
 * Clicking outside any open panel closes it (click-away). Route changes
 * re-open only the active group's panel.
 * Client component for open/close + active-link state only.
 */
export function ProjectSectionNav({ projectId }: { projectId: number }) {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);
  // One ref per group to measure anchor position for dropdown placement
  const anchorRefs = useRef<Record<string, React.RefObject<HTMLLIElement | null>>>({});
  for (const group of projectSectionGroups) {
    if (!anchorRefs.current[group.key]) {
      anchorRefs.current[group.key] = { current: null };
    }
  }

  const [openState, dispatch] = useReducer(
    openReducer,
    null,
    () => initialOpenState(pathname, projectId),
  );

  // Re-open only the active group when the route changes (section link clicked)
  useEffect(() => {
    const activeKey =
      projectSectionGroups.find((g) => isGroupActive(pathname, projectId, g))?.key ?? null;
    dispatch({ type: "reset", activeKey });
  }, [pathname, projectId]);

  // Click-away: close all panels when clicking outside the nav
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        dispatch({ type: "close-all" });
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <nav
      ref={navRef}
      aria-label={messages.projects.sectionsNav}
      data-testid="project-section-nav"
      className="-mx-4 bg-surface-raised"
      style={{ position: "relative" }}
    >
      {/* Tab strip — overflow-x-auto for scroll, overflow-y visible so dropdowns escape */}
      <div className="overflow-x-auto scrollbar-none">
        <ul className="flex px-4" style={{ overflow: "visible" }}>
          {projectSectionGroups.map((group) => {
            const ref = anchorRefs.current[group.key]!;
            return (
              <li
                key={group.key}
                ref={(el) => { ref.current = el; }}
                className="relative shrink-0 self-stretch flex"
              >
                <button
                  type="button"
                  aria-expanded={!!openState[group.key]}
                  aria-controls={`section-group-${group.key}`}
                  onClick={() => dispatch({ type: "toggle", key: group.key })}
                  className={tabClass(
                    isGroupActive(pathname, projectId, group),
                    !!openState[group.key],
                  )}
                >
                  {group.label}
                  <Chevron open={!!openState[group.key]} />
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Dropdowns rendered after the strip — outside overflow context */}
      {projectSectionGroups.map((group) => (
        <GroupDropdown
          key={group.key}
          group={group}
          projectId={projectId}
          pathname={pathname}
          open={!!openState[group.key]}
          anchorRef={anchorRefs.current[group.key]!}
        />
      ))}
    </nav>
  );
}
