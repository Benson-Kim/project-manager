import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { messages } from "../src/lib/messages";

/**
 * Stakeholders module (#6) — create happy path in the URL-synced sheet,
 * validation failure, axe scans on list + sheet form. Runs as e2e-pm
 * (storage state from auth.setup.ts — no extra logins, LESSONS §12).
 */

test("create stakeholder happy path — appears in the list", async ({ page }) => {
  const firstName = `E2E stakeholder ${Date.now()}`;
  await page.goto("/stakeholders");
  await page.getByTestId("new-stakeholder").click();
  const form = page.getByTestId("stakeholder-form");
  await expect(form).toBeVisible();
  await form.getByLabel(messages.stakeholders.project).selectOption("2");
  await form.getByLabel(messages.stakeholders.firstName).fill(firstName);
  await form.getByLabel(messages.stakeholders.engagementLevel).selectOption("High");
  await page.getByTestId("stakeholder-save").click();
  await expect(
    page.getByTestId("toast-success").filter({ hasText: messages.feedback.created }).first(),
  ).toBeVisible();
  await expect(form).toHaveCount(0); // sheet closed, ?id= cleared

  await page.goto(`/stakeholders?q=${encodeURIComponent(firstName)}`);
  await expect(page.getByText(firstName).first()).toBeVisible();
});

test("validation failure — empty first name shows inline error and focuses the summary", async ({
  page,
}) => {
  await page.goto("/stakeholders?id=new");
  const form = page.getByTestId("stakeholder-form");
  await expect(form).toBeVisible();
  await page.getByTestId("stakeholder-save").click();
  await expect(page.getByText(messages.stakeholders.firstNameRequired).first()).toBeVisible();
  const summary = page.getByRole("alert").filter({ hasText: messages.errors.summaryTitle });
  await expect(summary).toBeVisible();
  await expect(summary).toBeFocused();
});

test("sheet is URL-synced — deep link ?id= opens the seeded stakeholder", async ({ page }) => {
  await page.goto("/stakeholders?id=1");
  const form = page.getByTestId("stakeholder-form");
  await expect(form).toBeVisible();
  await expect(form.getByLabel(messages.stakeholders.firstName)).toHaveValue("Gary");
});

test("axe scan on the stakeholders list has no serious or critical violations", async ({
  page,
}) => {
  await page.goto("/stakeholders");
  await expect(page.getByRole("heading", { name: messages.stakeholders.title })).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) =>
    ["serious", "critical"].includes(v.impact ?? ""),
  );
  expect(serious).toEqual([]);
});

test("axe scan on the stakeholder sheet has no serious or critical violations", async ({
  page,
}) => {
  await page.goto("/stakeholders?id=1");
  await expect(page.getByTestId("stakeholder-form")).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) =>
    ["serious", "critical"].includes(v.impact ?? ""),
  );
  expect(serious).toEqual([]);
});
