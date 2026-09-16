import { describe, expect, it } from "vitest";
import {
  isCurrentSection,
  projectSections,
  sectionHref,
  type ProjectSection,
} from "./project-sections";

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

  it("registry lists built sections in ADR-0018 order", () => {
    expect(projectSections.map((s) => s.segment)).toEqual([".", "suppliers"]);
  });
});
