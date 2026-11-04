"use client";

import Link from "next/link";

import { projectOverviewHref } from "@/modules/projects/project-links";

/**
 * A project's name, linked to that project's Overview.
 *
 * Datasheet rows and cards are themselves clickable, and an anchor is not one of
 * the controls the sheet treats as an edit target, so the click would also open
 * the record the name sits on and race it to a different page. It stops here.
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
      className={className ?? "text-accent underline"}
      onClick={(event) => event.stopPropagation()}
    >
      {children}
    </Link>
  );
}
