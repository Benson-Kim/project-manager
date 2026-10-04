"use client";

import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useReducer, useRef, useState } from "react";
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
// Group trigger button
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
  // plain link - no disclosure needed.
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
 * Project section navigation (ADR-0019): four group disclosure buttons
 * (Overview / Planning / People / Activity), each toggling a dropdown panel
 * of section links. The active group's panel opens on mount; route changes
 * re-evaluate which group is active and reset the rest.
 *
 * ARIA disclosure pattern: buttons are aria-expanded, panels are role="group".
 *
 * Overflow note: panels are rendered via ReactDOM.createPortal directly into
 * document.body, bypassing every ancestor overflow/stacking context. The panel
 * position is computed from the trigger button's getBoundingClientRect() and
 * accounts for window scroll, so it always aligns under its trigger regardless
 * of the nav's position in the layout tree.
 */
export function ProjectSectionNav({ projectId }: { projectId: number }) {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);

  // One ref per group so we can read the trigger's viewport position.
  const triggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const [openState, dispatch] = useReducer(openReducer, null, () =>
    initialOpenState(pathname, projectId),
  );

  // Track the pixel position of each open trigger so the portal panel can
  // position itself correctly. Updated whenever openState changes.
  const [panelPositions, setPanelPositions] = useState<
    Record<string, { top: number; left: number }>
  >({});

  useEffect(() => {
    let frame: number | null = null;
    const updatePositions = () => {
      frame = null;
      const positions: Record<string, { top: number; left: number }> = {};
      for (const group of projectSectionGroups) {
        if (openState[group.key]) {
          const el = triggerRefs.current[group.key];
          if (el) {
            const rect = el.getBoundingClientRect();
            positions[group.key] = {
              top: rect.bottom + window.scrollY,
              left: rect.left + window.scrollX,
            };
          }
        }
      }
      setPanelPositions(positions);
    };
    const scheduleUpdate = () => {
      if (frame === null) frame = window.requestAnimationFrame(updatePositions);
    };

    scheduleUpdate();
    window.addEventListener("scroll", scheduleUpdate, true);
    window.addEventListener("resize", scheduleUpdate);
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", scheduleUpdate, true);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [openState]);

  // Resync the active group when the route or project changes.
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

      {/* Panels are portalled to <body> so they are never clipped by any
          ancestor overflow or stacking context. Position is computed from the
          trigger's getBoundingClientRect() + window scroll. */}
      {projectSectionGroups.map((group) => {
        if (!openState[group.key]) return null;
        if (group.sections.length <= 1) return null;

        const panelId = `section-group-${group.key}`;
        const pos = panelPositions[group.key];

        return createPortal(
          <div
            key={group.key}
            id={panelId}
            role="group"
            aria-label={group.label}
            style={
              pos ? { position: "absolute", top: pos.top + 4, left: pos.left } : { display: "none" }
            }
            className="z-(--z-dropdown) min-w-44 rounded-lg border border-line bg-surface shadow-lg"
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
          </div>,
          document.body,
        );
      })}
    </nav>
  );
}
