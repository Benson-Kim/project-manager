import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { messages } from "../src/lib/messages";

/**
 * Assumptions & constraints module (#13) — project-scoped route
 * /projects/2/assumptions-constraints. Create happy path in the URL-synced
 * sheet, validation failure, deep link, axe scans. Runs as e2e-pm (storage
 * state from auth.setup.ts — no extra logins, LESSONS §12).
 * Seeded items: ids 1–8, all on project 2 (seed 014_assumption_constraint.sql).
 */

test("create assumption happy path — appears in the list", async ({ page }) => {
  const description = `E2E assumption ${Date.now()}`;
  await page.goto("/projects/2/assumptions-constraints");
  await page.getByTestId("new-assumption-constraint").click();
  const form = page.getByTestId("assumption-constraint-form");
  await expect(form).toBeVisible();
  await form.getByLabel(messages.assumptionsConstraints.description).fill(description);
  await form.getByLabel(messages.assumptionsConstraints.type).selectOption("Assumption");
  await page.getByTestId("assumption-constraint-save").click();
  await expect(
    page.getByTestId("toast-success").filter({ hasText: messages.feedback.created }).first(),
  ).toBeVisible();
  await expect(form).toHaveCount(0); // sheet closed, ?id= cleared

  await page.goto(
    `/projects/2/assumptions-constraints?q=${encodeURIComponent(description)}`,
  );
  await expect(page.getByText(description).first()).toBeVisible();
});

test("validation failure — empty description shows inline error and focuses the summary", async ({
  page,
}) => {
  await page.goto("/projects/2/assumptions-constraints?id=new");
  const form = page.getByTestId("assumption-constraint-form");
  await expect(form).toBeVisible();
  const descField = form.getByLabel(messages.assumptionsConstraints.description);
  await descField.fill("  ");
  await descField.blur();
  await expect(
    page.getByText(messages.assumptionsConstraints.descriptionRequired).first(),
  ).toBeVisible();
  await page.getByTestId("assumption-constraint-save").click();
  const summary = page.getByRole("alert").filter({ hasText: messages.errors.summaryTitle });
  await expect(summary).toBeVisible();
  await expect(summary).toBeFocused();
});

test("sheet is URL-synced — deep link ?id=1 opens the seeded item", async ({ page }) => {
  await page.goto("/projects/2/assumptions-constraints?id=1");
  const form = page.getByTestId("assumption-constraint-form");
  await expect(form).toBeVisible();
  // Seeded id 1: "I will make it on time", Type = Constraint
  await expect(form.getByLabel(messages.assumptionsConstraints.description)).toHaveValue(
    "I will make it on time",
  );
});

test("edit seeded item and save — reflects in the list", async ({ page }) => {
  await page.goto("/projects/2/assumptions-constraints?id=2");
  const form = page.getByTestId("assumption-constraint-form");
  await expect(form).toBeVisible();
  const descField = form.getByLabel(messages.assumptionsConstraints.description);
  const updatedDesc = `Updated ${Date.now()}`;
  await descField.fill(updatedDesc);
  await page.getByTestId("assumption-constraint-save").click();
  await expect(
    page.getByTestId("toast-success").filter({ hasText: messages.feedback.saved }).first(),
  ).toBeVisible();
  await expect(form).toHaveCount(0);
});

test("axe scan on the assumptions & constraints list has no serious or critical violations", async ({
  page,
}) => {
  await page.goto("/projects/2/assumptions-constraints");
  await expect(
    page.getByRole("heading", { name: messages.assumptionsConstraints.title }),
  ).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) =>
    ["serious", "critical"].includes(v.impact ?? ""),
  );
  expect(serious).toEqual([]);
});

test("axe scan on the sheet has no serious or critical violations", async ({ page }) => {
  await page.goto("/projects/2/assumptions-constraints?id=1");
  await expect(page.getByTestId("assumption-constraint-form")).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) =>
    ["serious", "critical"].includes(v.impact ?? ""),
  );
  expect(serious).toEqual([]);
});
