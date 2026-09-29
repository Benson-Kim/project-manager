import { messages } from "@/lib/messages";

/**
 * Project section registry (ADR-0018): mirrors nav-items.ts for the project
 * workspace. Each deployed module appends its entry so unbuilt sections do
 * not appear (no placeholders in the section nav).
 * Segment order per ADR-0018 point 3: charter (index) · objectives ·
 * deliverables · stakeholders · suppliers · activities · todos ·
 * keywords.
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
  { segment: "objectives", label: messages.projects.objectivesSection, match: "prefix" },
  { segment: "deliverables", label: messages.projects.deliverablesSection, match: "prefix" },
  { segment: "stakeholders", label: messages.projects.stakeholdersSection, match: "prefix" },
  { segment: "suppliers", label: messages.projects.suppliersSection, match: "prefix" },
  { segment: "daily-activities", label: messages.projects.dailyActivitiesSection, match: "prefix" },
  { segment: "todos", label: messages.projects.todosSection, match: "prefix" },
  { segment: "keywords", label: messages.projects.keywordsSection, match: "prefix" },
  { segment: "questions-answers", label: messages.projects.questionsAnswersSection, match: "prefix" },
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
