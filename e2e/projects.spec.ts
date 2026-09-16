import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { messages } from "../src/lib/messages";

/**
 * Projects module (#5) — create happy path, validation failure, type-ahead
 * jump, axe scans. Runs as e2e-pm (storage state from auth.setup.ts).
 */

test("create project happy path — appears in the list", async ({ page }) => {
  const name = `E2E project ${Date.now()}`;
  await page.goto("/projects/new");
  await page.getByLabel(messages.projects.name).fill(name);
  await page.getByTestId("project-save").click();
  // Success lands on the charter route with a Created toast.
  await expect(
    page.getByTestId("toast-success").filter({ hasText: messages.feedback.created }).first(),
  ).toBeVisible();
  await page.waitForURL(/\/projects\/\d+/);
  // The project name lives in the workspace header (ADR-0018); the page h1 is the section name.
  await expect(page.getByTestId("project-header-name")).toHaveText(name);

  await page.goto(`/projects?q=${encodeURIComponent(name)}`);
  await expect(page.getByText(name).first()).toBeVisible();
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
  await page.getByTestId("projects-search").fill("Up");
  const option = page.getByRole("option", { name: /Upgrade/ }).first();
  await expect(option).toBeVisible();
  await option.click();
  await page.waitForURL(/\/projects\/\d+/);
  await expect(page.getByTestId("project-header-name")).toHaveText(/Upgrade/);
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

test.describe("project workspace (ADR-0018)", () => {
  test("deep link shows breadcrumb, header and section nav with Charter current", async ({
    page,
  }) => {
    await page.goto("/projects/2");
    const header = page.getByTestId("project-header");
    await expect(header).toBeVisible();
    await expect(header.getByRole("link", { name: messages.projects.title })).toHaveAttribute(
      "href",
      "/projects",
    );
    const nav = page.getByRole("navigation", { name: messages.projects.sectionsNav });
    const charter = nav.getByRole("link", { name: messages.projects.charterSection });
    await expect(charter).toHaveAttribute("aria-current", "page");
    await expect(charter).toHaveAttribute("href", "/projects/2");
    // The page h1 stays the section name (PageHeader), not the project name.
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      messages.projects.charterSection,
    );
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

  test("unsaved changes guard intercepts client-side link navigation (ADR-0018 Q1)", async ({
    page,
  }) => {
    await page.goto("/projects/2");
    await expect(page.getByTestId("project-form")).toBeVisible();
    await page.getByLabel(messages.projects.manager).fill("Guard Probe");
    await page
      .getByTestId("project-header")
      .getByRole("link", { name: messages.projects.title })
      .click();
    // The click is intercepted: still on the charter, confirm dialog shown.
    const dialog = page.getByRole("dialog", { name: messages.feedback.unsavedChangesTitle });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: messages.actions.cancel }).click();
    await expect(page.getByLabel(messages.projects.manager)).toHaveValue("Guard Probe");
    await expect(page).toHaveURL(/\/projects\/2$/);
  });
});
