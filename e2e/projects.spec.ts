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
  await expect(page.getByRole("heading", { name })).toBeVisible();

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
  await expect(page.getByRole("heading", { name: /Upgrade/ })).toBeVisible();
});

test("axe scan on the projects list has no serious or critical violations", async ({ page }) => {
  await page.goto("/projects");
  await expect(page.getByRole("heading", { name: messages.projects.title })).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) => ["serious", "critical"].includes(v.impact ?? ""));
  expect(serious).toEqual([]);
});

test("axe scan on the charter workspace has no serious or critical violations", async ({
  page,
}) => {
  await page.goto("/projects/2");
  await expect(page.getByTestId("project-form")).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) => ["serious", "critical"].includes(v.impact ?? ""));
  expect(serious).toEqual([]);
});
