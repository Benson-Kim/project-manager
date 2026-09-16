import { messages } from "@/lib/messages";

/**
 * Project section registry (ADR-0018): mirrors nav-items.ts for the project
 * workspace. A module session appends its entry when its section page lands —
 * unbuilt sections do not appear (no placeholders in the section nav).
 * Segment order per ADR-0018 point 3: charter (index) · objectives ·
 * deliverables · risks · stakeholders · suppliers · resources · meetings ·
 * activities · todos · questions · parking-lot · financials · notes · keywords.
 */
export interface ProjectSection {
  /** Route segment under /projects/[id]; "." is the charter index route. */
  segment: string;
  label: string;
  /** "exact" for the index, "prefix" for sections with nested routes. */
  match: "exact" | "prefix";
}

export const projectSections: ProjectSection[] = [
  { segment: ".", label: messages.projects.charterSection, match: "exact" },
];

export function sectionHref(projectId: number, section: ProjectSection): string {
  return section.segment === "."
    ? `/projects/${projectId}`
    : `/projects/${projectId}/${section.segment}`;
}

export function isCurrentSection(
  pathname: string,
  projectId: number,
  section: ProjectSection,
): boolean {
  const href = sectionHref(projectId, section);
  const path = pathname.replace(/\/+$/, "") || "/";
  if (section.match === "exact") return path === href;
  return path === href || path.startsWith(`${href}/`);
}
