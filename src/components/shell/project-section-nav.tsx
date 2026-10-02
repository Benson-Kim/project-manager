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
// Group trigger button (no panel — panel is hoisted to <nav> level)
// ---------------------------------------------------------------------------

function GroupTrigger({
  group,
  projectId,
  pathname,
  open,
  panelId,
  triggerRef,
  onToggle,
}: {
  group: ProjectSectionGroup;
  projectId: number;
  pathname: string;
  open: boolean;
  panelId: string;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  onToggle: () => void;
}) {
  const active = isGroupActive(pathname, projectId, group);

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
    <li className="shrink-0">
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className={pillClass(active, open)}
      >
        {group.label}
        <Chevron open={open} />
      </button>
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
 *
 * Overflow note: the pill row scrolls horizontally via overflow-x-auto on the
 * <ul>. Panels are rendered as siblings of the <ul> inside the <nav> (which
 * has no overflow clipping) so they are never clipped by the scroll container.
 */
export function ProjectSectionNav({ projectId }: { projectId: number }) {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);

  // One ref per group so we can read offsetLeft for panel positioning.
  const triggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});

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
      className="relative -mx-4 border-b border-line"
    >
      {/* Horizontally scrollable pill row. overflow-x-auto on the <ul> clips
          its own overflow but NOT absolutely-positioned elements outside it.
          Panels are siblings of this <ul> (see below) to avoid clipping. */}
      <ul className="flex gap-1 overflow-x-auto px-4 py-2">
        {projectSectionGroups.map((group) => (
          <GroupTrigger
            key={group.key}
            group={group}
            projectId={projectId}
            pathname={pathname}
            open={!!openState[group.key]}
            panelId={`section-group-${group.key}`}
            triggerRef={{
              get current() {
                return triggerRefs.current[group.key] ?? null;
              },
              set current(el: HTMLButtonElement | null) {
                triggerRefs.current[group.key] = el;
              },
            }}
            onToggle={() => dispatch({ type: "toggle", key: group.key })}
          />
        ))}
      </ul>

      {/* Panels rendered here — inside <nav> but outside the scrolling <ul> —
          so overflow-x-auto on the <ul> never clips them. The <nav> itself
          is position:relative, so `absolute left-*` anchors to the nav edge.
          left offset matches the trigger button's offsetLeft so the panel
          aligns under its button even after horizontal scroll. */}
      {projectSectionGroups.map((group) => {
        if (!openState[group.key]) return null;
        if (group.sections.length <= 1) return null;

        const panelId = `section-group-${group.key}`;
        const trigger = triggerRefs.current[group.key];
        // offsetLeft is relative to the nearest positioned ancestor — the
        // <nav> (position:relative), so this is exactly what we need.
        const left = trigger ? trigger.offsetLeft : 16;

        return (
          <div
            key={group.key}
            id={panelId}
            role="group"
            aria-label={group.label}
            style={{ left }}
            className="absolute top-full z-(--z-dropdown) mt-1 min-w-44 rounded-lg border border-line bg-surface shadow-lg"
          >
            {group.sections.map((section) => {
              const current = isCurrentSection(pathname, projectId, section);
              return (
                <Link
                  key={section.segment}
                  href={sectionHref(projectId, section)}
                  aria-current={current ? "page" : undefined}
                  className={linkClass(current)}
                  onClick={() => dispatch({ type: "reset", activeKey: null })}
                >
                  {section.label}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}
