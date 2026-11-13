"use client";

import Link from "next/link";

import { projectOverviewHref } from "@/modules/projects/project-links";

/**
 * A project's name, linked to that project's Overview.
 *
 * Datasheet rows and cards are themselves clickable, so a click on the name would
 * also open the record the name sits on and race it to a different page. It stops
 * here; Enter on the link is left to the link by the list's own key handling.
 *
 * A record with no project keeps its caller's wording as plain text.
 */
export function ProjectLink({
  projectId,
  className,
  children,
}: {
  projectId: number | null;
  className?: string;
  children: React.ReactNode;
}) {
  if (projectId === null) return <>{children}</>;
  return (
    <Link
      href={projectOverviewHref(projectId)}
      className={className ?? "text-accent"}
      onClick={(event) => event.stopPropagation()}
    >
      {children}
    </Link>
  );
}
