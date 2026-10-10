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

/** A named group of sections shown as a collapsible disclosure in the nav. */
export interface ProjectSectionGroup {
  key: string;
  label: string;
  sections: ProjectSection[];
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
  {
    segment: "questions-answers",
    label: messages.projects.questionsAnswersSection,
    match: "prefix",
  },
  { segment: "parking-lot", label: messages.projects.parkingLotSection, match: "prefix" },
  {
    segment: "assumptions-constraints",
    label: messages.projects.assumptionsConstraintsSection,
    match: "prefix",
  },
];

/** Sections grouped for the disclosure nav (ADR-0018). */
export const projectSectionGroups: ProjectSectionGroup[] = [
  {
    key: "overview",
    label: messages.projects.charterSection,
    sections: projectSections.filter((s) => s.segment === "."),
  },
  {
    key: "planning",
    label: messages.planning.title,
    sections: projectSections.filter((s) =>
      [
        "objectives",
        "deliverables",
        "questions-answers",
        "parking-lot",
        "assumptions-constraints",
      ].includes(s.segment),
    ),
  },
  {
    key: "people",
    label: messages.people.title,
    sections: projectSections.filter((s) => ["stakeholders", "suppliers"].includes(s.segment)),
  },
  {
    key: "activity",
    label: messages.activity.title,
    sections: projectSections.filter((s) =>
      ["daily-activities", "todos", "keywords"].includes(s.segment),
    ),
  },
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

/**
 * Returns true when any section in the group is the current route.
 * Used by the disclosure nav to keep a group open when one of its sections
 * is active.
 */
export function isGroupActive(
  pathname: string,
  projectId: number,
  group: ProjectSectionGroup,
): boolean {
  return group.sections.some((s) => isCurrentSection(pathname, projectId, s));
}
