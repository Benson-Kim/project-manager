import { messages } from "@/lib/messages";

/**
 * Project section registry (ADR-0018 updated): grouped disclosure-button nav.
 * Four groups — Overview, Planning, People & Resources, Activity — each holds
 * its built sections as a flat list. A module session appends its entry to the
 * relevant group when its section page lands; unbuilt sections do not appear.
 *
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

export interface ProjectSectionGroup {
  /** Unique key for the group (used as React key). */
  key: string;
  label: string;
  sections: readonly ProjectSection[];
}

/** All built groups in display order. */
export const projectSectionGroups: readonly ProjectSectionGroup[] = [
  {
    key: "overview",
    label: messages.projects.charterSection,
    sections: [{ segment: ".", label: messages.projects.charterSection, match: "exact" }],
  },
  {
    key: "planning",
    label: messages.planning.title,
    sections: [
      {
        segment: "objectives",
        label: messages.objectives.title,
        match: "prefix",
      },
      {
        segment: "deliverables",
        label: messages.keyDeliverables.title,
        match: "prefix",
      },
    ],
  },
  {
    key: "people",
    label: messages.people.title,
    sections: [
      { segment: "stakeholders", label: messages.stakeholders.title, match: "prefix" },
      { segment: "suppliers", label: messages.suppliers.title, match: "prefix" },
    ],
  },
  {
    key: "activity",
    label: messages.activity.title,
    sections: [
      {
        segment: "daily-activities",
        label: messages.dailyActivities.title,
        match: "prefix",
      },
      {
        segment: "todos",
        label: messages.todoItems.title,
        match: "prefix",
      },
      { segment: "keywords", label: messages.keywords.title, match: "prefix" },
    ],
  },
] as const;

/**
 * All sections flattened across groups — used for shared utilities and tests.
 * @deprecated Prefer iterating `projectSectionGroups` directly.
 */
export const projectSections: readonly ProjectSection[] = projectSectionGroups.flatMap(
  (g) => g.sections,
);

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
 * Returns true when any section in the group matches the current pathname.
 * Used to highlight the group pill and auto-open its panel on mount.
 */
export function isGroupActive(
  pathname: string,
  projectId: number,
  group: ProjectSectionGroup,
): boolean {
  return group.sections.some((s) => isCurrentSection(pathname, projectId, s));
}
