import { describe, expect, it } from "vitest";
import { messages } from "@/lib/messages";
import { navItems, pageTitleFor, settingsNavItem } from "../nav-items";

describe("nav registry (shell spec, issue #28)", () => {
  it("lists the product owner's items in order", () => {
    expect(navItems.map((item) => item.label)).toEqual([
      messages.nav.dashboard,
      messages.nav.projects,
      messages.nav.dailyActivities,
      messages.nav.todoLists,
      messages.nav.reports,
    ]);
    expect(settingsNavItem.href).toBe("/settings");
  });

  it("resolves the header page title from the pathname", () => {
    expect(pageTitleFor("/")).toBe(messages.nav.dashboard);
    expect(pageTitleFor("/projects")).toBe(messages.nav.projects);
    expect(pageTitleFor("/projects/17")).toBe(messages.nav.projects);
    expect(pageTitleFor("/projects/new")).toBe(messages.projects.newProject);
    expect(pageTitleFor("/settings")).toBe(messages.nav.settings);
    expect(pageTitleFor("/change-password")).toBe(messages.auth.changePasswordTitle);
    expect(pageTitleFor("/unknown")).toBe(messages.app.name);
  });
});
