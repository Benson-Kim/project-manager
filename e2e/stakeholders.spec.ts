import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { messages } from "../src/lib/messages";
import { expectListed, openListed } from "./support/datasheet";

/**
 * Stakeholders module (#6) — project-scoped route /projects/2/stakeholders.
 * Create happy path in the URL-synced sheet, validation failure, axe scans on
 * list + sheet form. Runs as e2e-pm (storage state from auth.setup.ts — no
 * extra logins, LESSONS §12). Seeded stakeholder 1 = Gary on project 2.
 */

test("create stakeholder happy path — appears in the list", async ({ page }) => {
  const firstName = `E2E stakeholder ${Date.now()}`;
  await page.goto("/projects/2/stakeholders");
  await page.getByTestId("new-stakeholder").click();
  const form = page.getByTestId("stakeholder-form");
  await expect(form).toBeVisible();
  await form.getByLabel(messages.stakeholders.firstName).fill(firstName);
  await form.getByLabel(messages.stakeholders.engagementLevel).selectOption("High");
  await page.getByTestId("stakeholder-save").click();
  await expect(
    page.getByTestId("toast-success").filter({ hasText: messages.feedback.created }).first(),
  ).toBeVisible({ timeout: 15_000 });
  await expect(form).toHaveCount(0); // sheet closed, ?id= cleared

  await page.goto(`/projects/2/stakeholders?q=${encodeURIComponent(firstName)}`);
  await expectListed(page, firstName);
});

test("validation failure — empty first name shows inline error and focuses the summary", async ({
  page,
}) => {
  await page.goto("/projects/2/stakeholders?id=new");
  const form = page.getByTestId("stakeholder-form");
  await expect(form).toBeVisible();
  await page.getByTestId("stakeholder-save").click();
  await expect(page.getByText(messages.stakeholders.firstNameRequired).first()).toBeVisible();
  const summary = page.getByRole("alert").filter({ hasText: messages.errors.summaryTitle });
  await expect(summary).toBeVisible();
  await expect(summary).toHaveText(messages.errors.summaryTitle);
  await expect(summary).toBeFocused();
});

test("sheet is URL-synced — deep link ?id= opens the seeded stakeholder", async ({ page }) => {
  await page.goto("/projects/2/stakeholders?id=1");
  const form = page.getByTestId("stakeholder-form");
  await expect(form).toBeVisible();
  await expect(form.getByLabel(messages.stakeholders.firstName)).toHaveValue("Gary");
});

test("axe scan on the stakeholders list has no serious or critical violations", async ({
  page,
}) => {
  await page.goto("/projects/2/stakeholders");
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
  await page.goto("/projects/2/stakeholders?id=1");
  await expect(page.getByTestId("stakeholder-form")).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) =>
    ["serious", "critical"].includes(v.impact ?? ""),
  );
  expect(serious).toEqual([]);
});

test("communication plan — purpose, strategy and frequency are saved and visible on reopen", async ({
  page,
}) => {
  const firstName = `E2E comms plan ${Date.now()}`;
  await page.goto("/projects/2/stakeholders");
  await page.getByTestId("new-stakeholder").click();
  const form = page.getByTestId("stakeholder-form");
  await expect(form).toBeVisible();
  await form.getByLabel(messages.stakeholders.firstName).fill(firstName);
  await form
    .getByLabel(messages.stakeholders.communicationPurpose)
    .selectOption("Secure Approvals");
  await form
    .getByLabel(messages.stakeholders.communicationFrequency)
    .selectOption("Milestone-Driven");
  await form
    .getByLabel(messages.stakeholders.keyMessageStrategy)
    .fill("Lead with the schedule risk, then the ask");
  await page.getByTestId("stakeholder-save").click();
  await expect(
    page.getByTestId("toast-success").filter({ hasText: messages.feedback.created }).first(),
  ).toBeVisible({ timeout: 15_000 });

  await page.goto(`/projects/2/stakeholders?q=${encodeURIComponent(firstName)}`);
  await openListed(page, firstName);
  const editForm = page.getByTestId("stakeholder-form");
  await expect(editForm).toBeVisible();
  await expect(editForm.getByLabel(messages.stakeholders.communicationPurpose)).toHaveValue(
    "Secure Approvals",
  );
  await expect(editForm.getByLabel(messages.stakeholders.communicationFrequency)).toHaveValue(
    "Milestone-Driven",
  );
  await expect(editForm.getByLabel(messages.stakeholders.keyMessageStrategy)).toHaveValue(
    "Lead with the schedule risk, then the ask",
  );
});

test("the communication plan dropdowns offer the seeded options, not a fixed set", async ({
  page,
}) => {
  await page.goto("/projects/2/stakeholders?id=new");
  const form = page.getByTestId("stakeholder-form");
  await expect(form).toBeVisible();

  // Migration 054 seeds these; they are managed-list options, so an Admin can add to
  // them from "Edit list…" — the assertion is that each one reaches the dropdown.
  const purpose = form.getByLabel(messages.stakeholders.communicationPurpose).locator("option");
  for (const label of ["Gather Requirements", "Provide Status", "Secure Approvals"]) {
    await expect(purpose.filter({ hasText: label })).toHaveCount(1);
  }
  const frequency = form.getByLabel(messages.stakeholders.communicationFrequency).locator("option");
  for (const label of ["Daily", "Weekly", "Monthly", "Milestone-Driven", "Ad-Hoc"]) {
    await expect(frequency.filter({ hasText: label })).toHaveCount(1);
  }
});
