import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { messages } from "../src/lib/messages";

/**
 * Key deliverables module (#9) — create happy path, validation failure, Gantt
 * rendering (desktop + 360 px) and axe scans on the list and Gantt routes.
 * Runs as e2e-pm (storage state from auth.setup.ts). Project 2 is seeded with
 * deliverables and stakeholders.
 */

test("create deliverable happy path — appears in the list", async ({ page }) => {
  const requirement = `E2E deliverable ${Date.now()}`;
  await page.goto("/projects/2/deliverables?d=new");
  await expect(
    page.getByRole("heading", { name: messages.keyDeliverables.newDeliverable }),
  ).toBeVisible();
  await page.getByLabel(messages.keyDeliverables.requirement).fill(requirement);
  await page.getByLabel(messages.keyDeliverables.deadline).fill("2027-03-31");
  await page.getByTestId("deliverable-save").click();
  await expect(
    page.getByTestId("toast-success").filter({ hasText: messages.feedback.created }).first(),
  ).toBeVisible();

  await page.goto(`/projects/2/deliverables?q=${encodeURIComponent(requirement)}`);
  await expect(page.getByText(requirement).first()).toBeVisible();
});

test("validation failure — empty requirement shows the inline error", async ({ page }) => {
  await page.goto("/projects/2/deliverables?d=new");
  await page.getByTestId("deliverable-save").click();
  await expect(page.getByText(messages.keyDeliverables.requirementRequired).first()).toBeVisible();
  await expect(
    page.getByRole("alert").filter({ hasText: messages.errors.summaryTitle }),
  ).toBeVisible();
});

test("gantt renders bars linking to the deliverable sheet", async ({ page }) => {
  await page.goto("/projects/2/deliverables/gantt");
  await expect(
    page.getByRole("heading", { name: messages.keyDeliverables.ganttTitle }),
  ).toBeVisible();
  await expect(page.getByTestId("gantt-chart")).toBeVisible();
  // Seeded deliverable 1 (project 2) has a 2024 deadline — overdue bar.
  const bar = page.getByTestId("gantt-bar-1");
  await expect(bar).toBeVisible();
  await bar.focus();
  await expect(bar).toBeFocused();
  await bar.click();
  await page.waitForURL(/\/projects\/2\/deliverables\?d=1/);
  await expect(
    page.getByRole("heading", { name: messages.keyDeliverables.editTitle }),
  ).toBeVisible();
});

test("gantt renders at 360 px (mobile)", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/projects/2/deliverables/gantt");
  await expect(page.getByTestId("gantt-chart")).toBeVisible();
  await expect(page.getByTestId("gantt-bar-1")).toBeVisible();
});

test("axe scan on the deliverables list has no serious or critical violations", async ({
  page,
}) => {
  await page.goto("/projects/2/deliverables");
  await expect(page.getByRole("heading", { name: messages.keyDeliverables.title })).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) =>
    ["serious", "critical"].includes(v.impact ?? ""),
  );
  expect(serious).toEqual([]);
});

test("axe scan on the Gantt route has no serious or critical violations", async ({ page }) => {
  await page.goto("/projects/2/deliverables/gantt");
  await expect(page.getByTestId("gantt-chart")).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) =>
    ["serious", "critical"].includes(v.impact ?? ""),
  );
  expect(serious).toEqual([]);
});
