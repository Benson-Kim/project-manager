"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { messages } from "@/lib/messages";
import { isCurrentSection, projectSections, sectionHref } from "./project-sections";

const pillClass = (current: boolean) =>
  `inline-flex min-h-11 items-center rounded-full px-6 text-sm font-medium whitespace-nowrap ${
    current ? "bg-accent-soft text-accent" : "text-ink-muted hover:bg-surface-sunken"
  }`;

/**
 * Project section navigation (ADR-0018): one horizontally scrollable row of
 * plain links — links, not ARIA tabs. aria-current="page" on the active
 * section (exact for the index, prefix for sections with nested routes);
 * CSS-only edge fade for overflow; the active pill is scrolled into view on
 * mount (one read, one write — no layout thrash). Client component only for
 * the active state.
 */
export function ProjectSectionNav({ projectId }: { projectId: number }) {
  const pathname = usePathname();
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const list = listRef.current;
    const active = list?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!list || !active) return;
    const start = active.offsetLeft;
    const end = start + active.offsetWidth;
    if (start < list.scrollLeft || end > list.scrollLeft + list.clientWidth) {
      list.scrollLeft = Math.max(0, start - 16);
    }
  }, [pathname]);

  return (
    <nav
      aria-label={messages.projects.sectionsNav}
      data-testid="project-section-nav"
      className="-mx-4 border-b border-line"
    >
      <ul
        ref={listRef}
        className="flex gap-1 overflow-x-auto px-4 py-2 [scrollbar-width:none] [mask-image:linear-gradient(to_right,transparent,black_16px,black_calc(100%_-_16px),transparent)]"
      >
        {projectSections.map((section) => {
          const current = isCurrentSection(pathname, projectId, section);
          return (
            <li key={section.segment} className="shrink-0">
              <Link
                href={sectionHref(projectId, section)}
                aria-current={current ? "page" : undefined}
                className={pillClass(current)}
              >
                {section.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
