import { describe, expect, it } from "vitest";
import { windowTitle } from "../window-title";

const APP = "Project Manager";

describe("windowTitle", () => {
  it.each([
    ["Projects · Project Manager", "Projects"],
    ["To-do list · Project Manager", "To-do list"],
    ["Permissions: Ada · Project Manager", "Permissions: Ada"],
    ["Budget - Project Manager", "Budget"],
    ["Budget — Project Manager", "Budget"],
    ["Budget | Project Manager", "Budget"],
    ["Sign in — Project Manager · Project Manager", "Sign in"],
    ["Projects — Project Manager · Project Manager", "Projects"],
    ["Budget · Financials — Project Manager · Project Manager", "Budget · Financials"],
  ])("drops the app name from %s", (page, title) => {
    expect(windowTitle(page, APP)).toBe(title);
  });

  it("keeps the app name when the page has no title of its own", () => {
    expect(windowTitle("Project Manager", APP)).toBe(APP);
    expect(windowTitle("Project Manager · Project Manager", APP)).toBe(APP);
    expect(windowTitle("", APP)).toBe(APP);
    expect(windowTitle("   ", APP)).toBe(APP);
  });

  it("leaves a title that only mentions the app name elsewhere", () => {
    expect(windowTitle("Project Manager handbook", APP)).toBe("Project Manager handbook");
    expect(windowTitle("Notes on Project Manager", APP)).toBe("Notes on Project Manager");
  });
});
