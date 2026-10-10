import { describe, expect, it } from "vitest";
import {
  canAddWith,
  filteredProjectId,
  parseProjectFilter,
  projectChoices,
  projectPicker,
  type ProjectOption,
} from "../project-options";

const options: ProjectOption[] = [
  { id: 1, name: "Alpha", access: "Manager" },
  { id: 2, name: "Beta", access: "Contributor" },
  { id: 3, name: "Gamma", access: "Viewer" },
];

describe("cross-project pickers and filters", () => {
  it("offers the projects whose level allows the permission", () => {
    expect(projectChoices(options, "daily-activities:create")).toEqual([
      { value: "1", label: "Alpha" },
      { value: "2", label: "Beta" },
    ]);
    expect(projectChoices(options, "daily-activities:delete").map((c) => c.label)).toEqual([
      "Alpha",
    ]);
  });

  it("reads ?project=: none, a visible project, or no filter", () => {
    expect(parseProjectFilter("none", options)).toEqual({ kind: "none" });
    expect(parseProjectFilter("2", options)).toEqual({ kind: "project", projectId: 2 });
    // Hidden or unknown ids never reach the proc.
    expect(parseProjectFilter("99", options)).toEqual({ kind: "all" });
    expect(parseProjectFilter("abc", options)).toEqual({ kind: "all" });
    expect(parseProjectFilter(undefined, options)).toEqual({ kind: "all" });
    expect(filteredProjectId({ kind: "project", projectId: 2 })).toBe(2);
    expect(filteredProjectId({ kind: "none" })).toBeNull();
  });

  it("starts the new-entry row in the preferred project when the actor may add there", () => {
    expect(projectPicker(options, "daily-activities:create", true, 2).initial).toBe("2");
    // Viewer-only project: fall back to none (shared space allowed)…
    expect(projectPicker(options, "daily-activities:create", true, 3).initial).toBe("");
    // …or to the first allowed project when the shared space isn't.
    const noShared = projectPicker(options, "daily-activities:create", false, 3);
    expect(noShared).toMatchObject({ initial: "1", clearable: false });
  });

  it("lets the actor add when there is a project or the shared space to add to", () => {
    expect(canAddWith(projectPicker(options, "daily-activities:create", false, null))).toBe(true);
    expect(canAddWith(projectPicker([], "daily-activities:create", true, null))).toBe(true);
    expect(canAddWith(projectPicker([], "daily-activities:create", false, null))).toBe(false);
  });
});
