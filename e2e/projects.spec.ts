import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { messages } from "../src/lib/messages";
import { expectListed } from "./support/datasheet";

/**
 * Projects module (#5) — create happy path, validation failure, type-ahead
 * jump, axe scans. Runs as e2e-pm (storage state from auth.setup.ts).
 */

test("create project happy path — appears in the list", async ({ page }) => {
  const name = `E2E project ${Date.now()}`;
  await page.goto("/projects/new");
  await page.getByLabel(messages.projects.name).fill(name);
  await page.getByTestId("project-save").click();
  // Success navigates to the charter route; wait for the URL change first.
  await page.waitForURL(/\/projects\/\d+/);
  // The project-switcher combobox in the header displays the current project name.
  await expect(page.getByRole("combobox", { name: messages.projects.jumpToProject })).toHaveValue(
    name,
  );
  // Toast is shown after redirect — may already be gone; assert the list instead.
  await page.goto(`/projects?q=${encodeURIComponent(name)}`);
  await expectListed(page, name);
});

test("validation failure — empty name shows inline error and focuses the summary", async ({
  page,
}) => {
  await page.goto("/projects/new");
  await page.getByTestId("project-save").click();
  await expect(page.getByText(messages.projects.nameRequired).first()).toBeVisible();
  const summary = page.getByRole("alert").filter({ hasText: messages.errors.summaryTitle });
  await expect(summary).toBeVisible();
  await expect(summary).toBeFocused();
});

test("type-ahead suggests seeded projects from the first characters and jumps", async ({
  page,
}) => {
  await page.goto("/projects");
  const search = page.getByTestId("projects-search");
  await search.fill("Up");
  // Debounce is 250 ms + server action; wait generously for the listbox option.
  const option = page.getByRole("option", { name: /Upgrade/ }).first();
  await expect(option).toBeVisible({ timeout: 5000 });
  await option.click();
  await page.waitForURL(/\/projects\/\d+/);
  // The project-switcher combobox shows the project name after navigation.
  await expect(page.getByRole("combobox", { name: messages.projects.jumpToProject })).toHaveValue(
    /Upgrade/,
  );
});

test("axe scan on the projects list has no serious or critical violations", async ({ page }) => {
  await page.goto("/projects");
  await expect(page.getByRole("heading", { name: messages.projects.title })).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) =>
    ["serious", "critical"].includes(v.impact ?? ""),
  );
  expect(serious).toEqual([]);
});

test("axe scan on the charter workspace has no serious or critical violations", async ({
  page,
}) => {
  await page.goto("/projects/2");
  await expect(page.getByTestId("project-form")).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) =>
    ["serious", "critical"].includes(v.impact ?? ""),
  );
  expect(serious).toEqual([]);
});

test.describe("project workspace", () => {
  test("deep link shows project-switcher, section nav with Charter current", async ({ page }) => {
    await page.goto("/projects/2");
    // The project-switcher combobox is the header component for project routes.
    const switcher = page.getByRole("combobox", { name: messages.projects.jumpToProject });
    await expect(switcher).toBeVisible();
    // The section nav is grouped: the Overview group button should be expanded (active group
    // auto-opens on load) and the Charter link inside it carries aria-current="page".
    const nav = page.getByRole("navigation", { name: messages.projects.sectionsNav });

    // ADR-0019: the Overview group has exactly one section (Charter). It renders
    // as a plain <Link> pill — not a disclosure button — so there is no
    // aria-expanded. The Charter link itself carries aria-current="page".
    const charter = nav.getByRole("link", { name: messages.projects.charterSection });
    await expect(charter).toHaveAttribute("aria-current", "page");
    await expect(charter).toHaveAttribute("href", "/projects/2");

    // The Planning group (≥2 sections) renders as a disclosure button.
    const planningBtn = nav.getByRole("button", { name: messages.planning.title });
    await expect(planningBtn).toBeVisible();
    await expect(planningBtn).toHaveAttribute("aria-expanded", "false");

    // The page h1 stays the section name (PageHeader), not the project name.
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      messages.projects.charterSection,
    );
  });

  test("team cog: a manager grants a section permission per person, then resets it (ADR-0024)", async ({
    page,
  }) => {
    await page.goto("/projects/2");
    const team = page.getByTestId("assignee-list");
    const P = messages.projects.permissions;
    const open = async () => {
      await team
        .getByRole("button", { name: messages.projects.permissionsFor("E2E Contributor") })
        .click();
      const dialog = page.getByRole("dialog", { name: P.title("E2E Contributor") });
      await expect(dialog).toBeVisible();
      return dialog;
    };
    const deleteParkingLot = (dialog: import("@playwright/test").Locator) =>
      dialog.getByRole("combobox", { name: P.cell(P.delete, messages.projects.parkingLotSection) });

    let dialog = await open();
    await deleteParkingLot(dialog).selectOption("allow");
    await dialog.getByTestId("permissions-save").click();
    await expect(dialog).toBeHidden();

    dialog = await open();
    await expect(deleteParkingLot(dialog)).toHaveValue("allow");
    await dialog.getByRole("button", { name: P.reset }).click();
    await dialog.getByTestId("permissions-save").click();
    await expect(dialog).toBeHidden();
  });

  test("a section link inside a group panel navigates (portalled panel is not 'outside')", async ({
    page,
  }) => {
    await page.goto("/projects/2");
    const nav = page.getByRole("navigation", { name: messages.projects.sectionsNav });
    await nav.getByRole("button", { name: messages.planning.title }).click();
    await page.getByRole("link", { name: messages.projects.parkingLotSection }).click();
    await expect(page).toHaveURL(/\/projects\/2\/parking-lot$/);
  });

  test.describe("at 360px", () => {
    test.use({ viewport: { width: 360, height: 740 } });

    test("section nav is visible without horizontal page overflow; axe clean", async ({ page }) => {
      await page.goto("/projects/2");
      await expect(page.getByTestId("project-section-nav")).toBeVisible();
      await expect(page.getByTestId("project-form")).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBe(0);
      const results = await new AxeBuilder({ page }).analyze();
      const serious = results.violations.filter((v) =>
        ["serious", "critical"].includes(v.impact ?? ""),
      );
      expect(serious).toEqual([]);
    });
  });

  test("unsaved changes guard intercepts client-side link navigation", async ({ page }) => {
    await page.goto("/projects/2");
    await expect(page.getByTestId("project-form")).toBeVisible();
    // Exact and scoped: the team grid's controls are named after "E2E Project Manager".
    const manager = page
      .getByTestId("project-form")
      .getByLabel(messages.projects.manager, { exact: true });
    await manager.fill("Guard Probe");
    // Navigate away via the sidebar Projects link — the guard intercepts it.
    await page
      .getByRole("navigation", { name: messages.app.menu })
      .getByRole("link", { name: messages.projects.title })
      .click();
    // The click is intercepted: still on the charter, confirm dialog shown.
    const dialog = page.getByRole("dialog", { name: messages.feedback.unsavedChangesTitle });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: messages.actions.cancel }).click();
    await expect(manager).toHaveValue("Guard Probe");
    await expect(page).toHaveURL(/\/projects\/2$/);
  });
});
