import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { messages } from "../src/lib/messages";
import { expectListed, expectNotListed } from "./support/datasheet";

/**
 * Assumptions & constraints module (#13) — project-scoped route
 * /projects/2/assumptions-constraints. Create happy path in the URL-synced
 * sheet, validation failure, deep link, edit, delete, type filter, axe scans.
 * Runs as e2e-pm (storage state from auth.setup.ts — no extra logins, LESSONS §12).
 * Seeded items: ids 1–8, all on project 2 (seed 014_assumption_constraint.sql).
 *   id=1: Type=Constraint, Description="I will make it on time", IsValidated=true
 *   id=2: Type=Assumption, Description="Is this constraint validated?"
 *   id=3: Type=Assumption, Description="This ia an assumption"
 *   id=5: Type=Assumption, Description="Assumption" (used for delete test)
 *   id=6: Type=Constraint, Description="Constraint"
 *   id=7: Type=Assumption, Description="Assumption and Constraint", Impact=High
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

  await page.goto(`/projects/2/assumptions-constraints?q=${encodeURIComponent(description)}`);
  await expectListed(page, description);
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

test("edit seeded item — updated value persists in the list and re-open shows new value", async ({
  page,
}) => {
  await page.goto("/projects/2/assumptions-constraints?id=3");
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

  // Verify the new value is visible in the list
  await page.goto(`/projects/2/assumptions-constraints?q=${encodeURIComponent(updatedDesc)}`);
  await expectListed(page, updatedDesc);

  // Verify re-opening the same record shows the updated value
  await page.goto("/projects/2/assumptions-constraints?id=3");
  await expect(form).toBeVisible();
  await expect(descField).toHaveValue(updatedDesc);
});

test("delete seeded item — record disappears from the list", async ({ page }) => {
  // Use id=5 ("Assumption") — not used by other tests
  await page.goto("/projects/2/assumptions-constraints?id=5");
  const form = page.getByTestId("assumption-constraint-form");
  await expect(form).toBeVisible();

  await page.getByTestId("assumption-constraint-delete").click();

  // Confirm delete dialog
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: messages.actions.delete }).click();

  await expect(
    page.getByTestId("toast-success").filter({ hasText: messages.feedback.deleted }).first(),
  ).toBeVisible();
  await expect(form).toHaveCount(0);
});

test("type filter — Constraint only shows Constraint rows", async ({ page }) => {
  await page.goto("/projects/2/assumptions-constraints");
  await page.getByRole("heading", { name: messages.assumptionsConstraints.title }).waitFor();

  // Apply Constraint filter
  const filterSelect = page.getByTestId("filter-type");
  await filterSelect.selectOption("Constraint");

  // URL should update
  await expect(page).toHaveURL(/type=Constraint/);

  // Seeded Constraint: id=1 "I will make it on time", id=6 "Constraint"
  await expectListed(page, "I will make it on time");

  // Seeded Assumption: id=2 "Is this constraint validated?" should NOT appear
  await expectNotListed(page, "Is this constraint validated?");
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
