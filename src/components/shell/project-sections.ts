import { messages } from "@/lib/messages";
import { projectOverviewHref } from "@/modules/projects/project-links";

/**
 * Project section registry: every built page of a project workspace, then the
 * menu groups that show them. A new page is one entry here plus its place in a
 * group; pages that are not built are left out (no placeholders in the menu).
 */
export interface ProjectSection {
  /** Route segment under /projects/[id]; "." is the overview index route. */
  segment: string;
  label: string;
  /** "exact" for the index, "prefix" for sections with nested routes. */
  match: "exact" | "prefix";
  /** A labelled sub-list inside the group panel (the Financials views). */
  subgroup?: string;
}

/** A named group of sections shown as a collapsible disclosure in the nav. */
export interface ProjectSectionGroup {
  key: string;
  label: string;
  sections: ProjectSection[];
}

const P = messages.projects;
const F = messages.financials;

const financialsView = (segment: string, label: string): ProjectSection => ({
  segment: `financials/${segment}`,
  label,
  match: "prefix",
  subgroup: P.financialsSection,
});

export const projectSections: ProjectSection[] = [
  { segment: ".", label: P.charterSection, match: "exact" },
  { segment: "requirements", label: P.requirementsSection, match: "prefix" },
  { segment: "objectives", label: P.objectivesSection, match: "prefix" },
  { segment: "deliverables", label: P.deliverablesSection, match: "prefix" },
  { segment: "deliverables/canvas", label: P.requirementsBoardSection, match: "prefix" },
  { segment: "stakeholders", label: P.stakeholderCommsSection, match: "prefix" },
  { segment: "stakeholders/matrix", label: messages.stakeholders.matrix.title, match: "prefix" },
  { segment: "responsibility", label: P.responsibilitySection, match: "prefix" },
  { segment: "suppliers", label: P.suppliersSection, match: "prefix" },
  { segment: "daily-activities", label: P.dailyActivitiesSection, match: "prefix" },
  { segment: "todos", label: P.todoAlertsMenuSection, match: "prefix" },
  { segment: "calendar", label: P.calendarSection, match: "prefix" },
  { segment: "keywords", label: P.keywordsSection, match: "prefix" },
  { segment: "questions-answers", label: P.questionsAnswersSection, match: "prefix" },
  { segment: "parking-lot", label: P.parkingLotSection, match: "prefix" },
  { segment: "assumptions-constraints", label: P.assumptionsConstraintsSection, match: "prefix" },
  { segment: "risks-issues", label: P.risksIssuesSection, match: "prefix" },
  { segment: "decisions", label: P.decisionsSection, match: "prefix" },
  { segment: "bpmn", label: P.bpmnSection, match: "prefix" },
  { segment: "meetings", label: P.meetingsSection, match: "prefix" },
  { segment: "boards", label: P.boardsSection, match: "prefix" },
  { segment: "checklists", label: P.checklistsSection, match: "prefix" },
  { segment: "notes", label: P.notesSection, match: "prefix" },
  financialsView("budget", F.budgetTab),
  financialsView("monitoring", F.monitoringTab),
  financialsView("documents", F.documentsTab),
  financialsView("settings", F.settings),
  financialsView("project-math", F.projectMath.title),
];

function sectionsIn(segments: readonly string[]): ProjectSection[] {
  return segments.map((segment) => {
    const section = projectSections.find((s) => s.segment === segment);
    if (!section) throw new Error(`Unknown project section: ${segment}`);
    return section;
  });
}

const G = P.sectionGroups;

/** The client's six menu groups, each listing its pages in the client's order. */
export const projectSectionGroups: ProjectSectionGroup[] = [
  {
    key: "strategy",
    label: G.strategy,
    sections: sectionsIn([
      ".",
      "objectives",
      "financials/budget",
      "financials/monitoring",
      "financials/documents",
      "financials/settings",
      "financials/project-math",
    ]),
  },
  {
    key: "requirements",
    label: G.requirements,
    sections: sectionsIn(["deliverables", "requirements", "deliverables/canvas"]),
  },
  {
    key: "execution",
    label: G.execution,
    sections: sectionsIn(["boards", "checklists", "daily-activities", "todos", "calendar"]),
  },
  {
    key: "governance",
    label: G.governance,
    sections: sectionsIn([
      "decisions",
      "risks-issues",
      "assumptions-constraints",
      "parking-lot",
      "questions-answers",
    ]),
  },
  {
    key: "workspace",
    label: G.workspace,
    sections: sectionsIn(["bpmn", "meetings", "notes"]),
  },
  {
    key: "communication",
    label: G.communication,
    sections: sectionsIn([
      "stakeholders/matrix",
      "stakeholders",
      "responsibility",
      "suppliers",
      "keywords",
    ]),
  },
];

export interface SectionRun {
  subgroup?: string;
  sections: ProjectSection[];
}

/** Consecutive sections of a group that share a sub-list label, in order. */
export function sectionRuns(sections: readonly ProjectSection[]): SectionRun[] {
  const runs: SectionRun[] = [];
  for (const section of sections) {
    const last = runs.at(-1);
    if (last && last.subgroup === section.subgroup) last.sections.push(section);
    else runs.push({ subgroup: section.subgroup, sections: [section] });
  }
  return runs;
}

export function sectionHref(projectId: number, section: ProjectSection): string {
  return section.segment === "."
    ? projectOverviewHref(projectId)
    : `${projectOverviewHref(projectId)}/${section.segment}`;
}

/** The nav link: a Financials view keeps the open financial (?f=<id>) when switching views. */
export function sectionLinkHref(
  projectId: number,
  section: ProjectSection,
  financialId: string | null,
): string {
  const href = sectionHref(projectId, section);
  return financialId && /^\d+$/.test(financialId) && section.segment.startsWith("financials/")
    ? `${href}?f=${financialId}`
    : href;
}

function routeMatches(path: string, projectId: number, section: ProjectSection): boolean {
  const href = sectionHref(projectId, section);
  if (section.match === "exact") return path === href;
  return path === href || path.startsWith(`${href}/`);
}

/** A section nested under another (the canvas under deliverables) is current on its own routes. */
export function isCurrentSection(
  pathname: string,
  projectId: number,
  section: ProjectSection,
): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (!routeMatches(path, projectId, section)) return false;
  return !projectSections.some(
    (nested) =>
      nested.segment.startsWith(`${section.segment}/`) && routeMatches(path, projectId, nested),
  );
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
