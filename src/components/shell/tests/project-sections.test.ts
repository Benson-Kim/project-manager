import { describe, expect, it } from "vitest";
import {
  isCurrentSection,
  isGroupActive,
  projectSectionGroups,
  projectSections,
  sectionHref,
  type ProjectSection,
  type ProjectSectionGroup,
} from "../project-sections";

const charter: ProjectSection = { segment: ".", label: "Charter", match: "exact" };
const meetings: ProjectSection = { segment: "meetings", label: "Meetings", match: "prefix" };

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
});

describe("projectSectionGroups", () => {
  it("has four groups in order: overview, planning, people, activity", () => {
    expect(projectSectionGroups.map((g) => g.key)).toEqual([
      "overview",
      "planning",
      "people",
      "activity",
    ]);
  });

  it("overview group contains the charter index section", () => {
    const overview = projectSectionGroups.find((g) => g.key === "overview")!;
    expect(overview.sections.map((s) => s.segment)).toContain(".");
  });

  it("planning group contains deliverables", () => {
    const planning = projectSectionGroups.find((g) => g.key === "planning")!;
    expect(planning.sections.map((s) => s.segment)).toContain("deliverables");
  });

  it("people group contains suppliers", () => {
    const people = projectSectionGroups.find((g) => g.key === "people")!;
    expect(people.sections.map((s) => s.segment)).toContain("suppliers");
  });

  it("activity group contains keywords", () => {
    const activity = projectSectionGroups.find((g) => g.key === "activity")!;
    expect(activity.sections.map((s) => s.segment)).toContain("keywords");
  });

  it("flatMap projectSections contains built segments in ADR-0018 order", () => {
    const segments = projectSections.map((s) => s.segment);
    expect(segments).toContain(".");
    expect(segments).toContain("deliverables");
    expect(segments).toContain("suppliers");
    expect(segments).toContain("keywords");
    // ADR-0018 order: charter before deliverables before suppliers before keywords
    expect(segments.indexOf(".")).toBeLessThan(segments.indexOf("deliverables"));
    expect(segments.indexOf("deliverables")).toBeLessThan(segments.indexOf("suppliers"));
    expect(segments.indexOf("suppliers")).toBeLessThan(segments.indexOf("keywords"));
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
});
