import { describe, expect, it } from "vitest";
import { messages } from "@/lib/messages";
import {
  isCurrentSection,
  isGroupActive,
  projectSectionGroups,
  projectSections,
  sectionHref,
  sectionLinkHref,
  sectionRuns,
  type ProjectSection,
  type ProjectSectionGroup,
} from "../project-sections";

const charter: ProjectSection = { segment: ".", label: "Charter", match: "exact" };
const meetings: ProjectSection = { segment: "meetings", label: "Meetings", match: "prefix" };

const group = (key: string) => projectSectionGroups.find((g) => g.key === key)!;
const segmentsOf = (key: string) => group(key).sections.map((s) => s.segment);
const section = (segment: string) => projectSections.find((s) => s.segment === segment)!;

describe("sectionHref", () => {
  it("maps the charter index to the project root route", () => {
    expect(sectionHref(2, charter)).toBe("/projects/2");
  });

  it("maps a section to its segment route", () => {
    expect(sectionHref(2, meetings)).toBe("/projects/2/meetings");
  });
});

describe("isCurrentSection", () => {
  it("exact match: the charter is current only on the index route", () => {
    expect(isCurrentSection("/projects/2", 2, charter)).toBe(true);
    expect(isCurrentSection("/projects/2/", 2, charter)).toBe(true);
    expect(isCurrentSection("/projects/2/meetings", 2, charter)).toBe(false);
    expect(isCurrentSection("/projects/22", 2, charter)).toBe(false);
  });

  it("prefix match: a section is current on its route and nested routes", () => {
    expect(isCurrentSection("/projects/2/meetings", 2, meetings)).toBe(true);
    expect(isCurrentSection("/projects/2/meetings/5", 2, meetings)).toBe(true);
    expect(isCurrentSection("/projects/2", 2, meetings)).toBe(false);
    expect(isCurrentSection("/projects/2/meetings-x", 2, meetings)).toBe(false);
    expect(isCurrentSection("/projects/22/meetings", 2, meetings)).toBe(false);
  });

  it("a page with its own entry under another (the canvas, the matrix) is the only current one", () => {
    const deliverables = section("deliverables");
    const canvas = section("deliverables/canvas");
    expect(isCurrentSection("/projects/2/deliverables/canvas", 2, canvas)).toBe(true);
    expect(isCurrentSection("/projects/2/deliverables/canvas", 2, deliverables)).toBe(false);
    expect(isCurrentSection("/projects/2/deliverables", 2, deliverables)).toBe(true);
    expect(isCurrentSection("/projects/2/deliverables/gantt", 2, deliverables)).toBe(true);
    expect(isCurrentSection("/projects/2/deliverables", 2, canvas)).toBe(false);

    const comms = section("stakeholders");
    const matrix = section("stakeholders/matrix");
    expect(isCurrentSection("/projects/2/stakeholders/matrix", 2, matrix)).toBe(true);
    expect(isCurrentSection("/projects/2/stakeholders/matrix", 2, comms)).toBe(false);
    expect(isCurrentSection("/projects/2/stakeholders", 2, comms)).toBe(true);
  });
});

describe("projectSectionGroups", () => {
  const G = messages.projects.sectionGroups;

  it("shows the client's six groups, in the client's order and names", () => {
    expect(projectSectionGroups.map((g) => g.label)).toEqual([
      G.strategy,
      G.requirements,
      G.execution,
      G.governance,
      G.workspace,
      G.communication,
    ]);
    expect(Object.values(G)).toEqual([
      "Strategy & Financials",
      "Requirements & Deliverables",
      "Execution",
      "Governance",
      "Workspace",
      "Communication",
    ]);
  });

  it("lists every built page exactly once across the groups", () => {
    const listed = projectSectionGroups.flatMap((g) => g.sections.map((s) => s.segment));
    expect(new Set(listed).size).toBe(listed.length);
    expect([...listed].sort()).toEqual(projectSections.map((s) => s.segment).sort());
  });

  it("every group is a disclosure of at least two pages", () => {
    for (const g of projectSectionGroups) expect(g.sections.length).toBeGreaterThanOrEqual(2);
  });

  it("Strategy & Financials: overview, objectives, then the financials views ending with performance analytics", () => {
    expect(segmentsOf("strategy")).toEqual([
      ".",
      "objectives",
      "financials/budget",
      "financials/monitoring",
      "financials/documents",
      "financials/settings",
      "financials/project-math",
    ]);
    expect(section("financials/project-math").label).toBe("Performance analytics");
  });

  it("Requirements & Deliverables: key deliverables, the tracker, then the canvas board", () => {
    expect(segmentsOf("requirements")).toEqual([
      "deliverables",
      "requirements",
      "deliverables/canvas",
    ]);
    expect(group("requirements").sections.map((s) => s.label)).toEqual([
      "Key deliverables (WBS/Gantt)",
      "Requirements tracker",
      "Dynamic requirements board",
    ]);
  });

  it("Execution: boards, checklists, daily activities, to-do & alerts, calendar", () => {
    expect(segmentsOf("execution")).toEqual([
      "boards",
      "checklists",
      "daily-activities",
      "todos",
      "calendar",
    ]);
    expect(section("checklists").label).toBe(messages.projects.checklistsSection);
    expect(sectionHref(2, section("checklists"))).toBe("/projects/2/checklists");
    expect(section("todos").label).toBe("To-do & alerts");
  });

  it("Governance: decision log, risks & issues, assumptions & constraints, parking lot, Q&A", () => {
    expect(segmentsOf("governance")).toEqual([
      "decisions",
      "risks-issues",
      "assumptions-constraints",
      "parking-lot",
      "questions-answers",
    ]);
  });

  it("Workspace: BPMN, meeting minutes, notes (notes matched as a prefix for its workspace route)", () => {
    expect(segmentsOf("workspace")).toEqual(["bpmn", "meetings", "notes"]);
    expect(section("meetings").label).toBe("Meeting minutes");
    expect(group("workspace").sections.at(-1)?.match).toBe("prefix");
  });

  it("Communication: stakeholder matrix, stakeholder comms, responsibility, suppliers, keywords", () => {
    expect(segmentsOf("communication")).toEqual([
      "stakeholders/matrix",
      "stakeholders",
      "responsibility",
      "suppliers",
      "keywords",
    ]);
    expect(
      group("communication")
        .sections.slice(0, 2)
        .map((s) => s.label),
    ).toEqual(["Stakeholder matrix", "Stakeholder comms"]);
  });

  it("only the financials views carry the Financials sub-list label", () => {
    const labelled = projectSections.filter((s) => s.subgroup).map((s) => s.segment);
    expect(labelled).toEqual(
      projectSections.filter((s) => s.segment.startsWith("financials/")).map((s) => s.segment),
    );
    expect(new Set(projectSections.map((s) => s.subgroup).filter(Boolean))).toEqual(
      new Set([messages.projects.financialsSection]),
    );
  });

  it("only the open financials view is current", () => {
    const budget = section("financials/budget");
    const monitoring = section("financials/monitoring");
    expect(sectionHref(2, budget)).toBe("/projects/2/financials/budget");
    expect(isCurrentSection("/projects/2/financials/budget", 2, budget)).toBe(true);
    expect(isCurrentSection("/projects/2/financials/budget", 2, monitoring)).toBe(false);
    expect(isCurrentSection("/projects/2/financials/monitoring", 2, monitoring)).toBe(true);
  });

  it("keeps the open financial when switching financials views, and only there", () => {
    const budget = section("financials/budget");
    expect(sectionLinkHref(2, budget, "7")).toBe("/projects/2/financials/budget?f=7");
    expect(sectionLinkHref(2, budget, null)).toBe("/projects/2/financials/budget");
    expect(sectionLinkHref(2, budget, "7&x=1")).toBe("/projects/2/financials/budget");
    expect(sectionLinkHref(2, meetings, "7")).toBe("/projects/2/meetings");
  });
});

describe("sectionRuns", () => {
  it("splits Strategy & Financials into its plain pages and the labelled Financials sub-list", () => {
    const runs = sectionRuns(group("strategy").sections);
    expect(runs.map((r) => [r.subgroup, r.sections.map((s) => s.segment)])).toEqual([
      [undefined, [".", "objectives"]],
      [
        messages.projects.financialsSection,
        [
          "financials/budget",
          "financials/monitoring",
          "financials/documents",
          "financials/settings",
          "financials/project-math",
        ],
      ],
    ]);
  });

  it("a group without sub-lists is one run", () => {
    expect(sectionRuns(group("governance").sections)).toHaveLength(1);
  });

  it("an empty list has no runs", () => {
    expect(sectionRuns([])).toEqual([]);
  });
});

describe("isGroupActive", () => {
  const overviewGroup: ProjectSectionGroup = {
    key: "overview",
    label: "Overview",
    sections: [{ segment: ".", label: "Charter", match: "exact" }],
  };

  const planningGroup: ProjectSectionGroup = {
    key: "planning",
    label: "Planning",
    sections: [{ segment: "deliverables", label: "Deliverables", match: "prefix" }],
  };

  it("returns true when a group section is the current route", () => {
    expect(isGroupActive("/projects/2", 2, overviewGroup)).toBe(true);
    expect(isGroupActive("/projects/2/deliverables", 2, planningGroup)).toBe(true);
  });

  it("returns true for nested routes within a group section", () => {
    expect(isGroupActive("/projects/2/deliverables/gantt", 2, planningGroup)).toBe(true);
  });

  it("returns false when the pathname is outside the group", () => {
    expect(isGroupActive("/projects/2/suppliers", 2, overviewGroup)).toBe(false);
    expect(isGroupActive("/projects/2", 2, planningGroup)).toBe(false);
  });

  it("returns false for a different project id", () => {
    expect(isGroupActive("/projects/99/deliverables", 2, planningGroup)).toBe(false);
  });

  it("the Requirements & Deliverables group is active on the canvas board", () => {
    expect(isGroupActive("/projects/2/deliverables/canvas", 2, group("requirements"))).toBe(true);
    expect(isGroupActive("/projects/2/stakeholders/matrix", 2, group("communication"))).toBe(true);
  });
});
