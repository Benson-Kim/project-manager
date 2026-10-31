import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator } from "@playwright/test";
import { messages } from "../src/lib/messages";
import { expectListed, expectNotListed } from "./support/datasheet";

/**
 * Risks & issues register (#14, ADR-0050) — project-scoped route
 * /projects/2/risks-issues. Create happy path in the URL-synced sheet,
 * validation failure, deep link, edit, category filter, axe scans.
 * Runs as e2e-pm (storage state from auth.setup.ts — no extra logins, LESSONS §12).
 * Seeded records: ids 1-2, both on project 2 (seed 015_risk_issue.sql), Category=Issue.
 *   id=1: Status=Closed, Priority=High, Impact=Low, Probability=High,
 *         Description="Adding risk/issues raises an error in the code, project id was missing"
 *   id=2: Status="In Progress", Priority=High, Probability=High,
 *         Description='Clicking "New Item" in Finanacials takes user to parking lot items'
 * Both descriptions are stored as HTML, so the list shows their text without the markup.
 */

/** The description field is a rich-text editor, not an input: type into its body. */
async function fillDescription(form: Locator, text: string) {
  const editor = form.getByRole("textbox", { name: messages.risksIssues.description });
  await editor.click();
  await editor.fill(text);
}

test("create a risk happy path — it appears in the list", async ({ page }) => {
  const description = `E2E risk ${Date.now()}`;
  await page.goto("/projects/2/risks-issues");
  await page.getByTestId("new-risk-issue").click();
  const form = page.getByTestId("risk-issue-form");
  await expect(form).toBeVisible();
  await fillDescription(form, description);
  // A new record starts as an open risk.
  await expect(form.getByLabel(messages.risksIssues.category, { exact: true })).toHaveValue("Risk");
  await expect(form.getByLabel(messages.risksIssues.status, { exact: true })).toHaveValue("Open");
  await page.getByTestId("risk-issue-save").click();
  await expect(
    page.getByTestId("toast-success").filter({ hasText: messages.feedback.created }).first(),
  ).toBeVisible();
  await expect(form).toHaveCount(0); // sheet closed, ?id= cleared

  await page.goto(`/projects/2/risks-issues?q=${encodeURIComponent(description)}`);
  await expectListed(page, description);
});

test("validation failure — an empty description shows the error summary", async ({ page }) => {
  await page.goto("/projects/2/risks-issues?id=new");
  const form = page.getByTestId("risk-issue-form");
  await expect(form).toBeVisible();
  await page.getByTestId("risk-issue-save").click();
  const summary = page.getByRole("alert").filter({ hasText: messages.errors.summaryTitle });
  await expect(summary).toBeVisible();
  await expect(summary).toBeFocused();
});

test("the due date may not precede the date identified", async ({ page }) => {
  await page.goto("/projects/2/risks-issues?id=new");
  const form = page.getByTestId("risk-issue-form");
  await expect(form).toBeVisible();
  await fillDescription(form, `E2E date order ${Date.now()}`);
  await form.getByLabel(messages.risksIssues.dateIdentified).fill("2026-04-01");
  const due = form.getByLabel(messages.risksIssues.dueDate);
  await due.fill("2026-03-01");
  await due.blur();
  await page.getByTestId("risk-issue-save").click();
  // The record is refused and the sheet stays open on the offending field.
  await expect(form).toBeVisible();
  await expect(page.getByRole("alert").first()).toBeVisible();
});

test("sheet is URL-synced — deep link ?id=1 opens the seeded record", async ({ page }) => {
  await page.goto("/projects/2/risks-issues?id=1");
  const form = page.getByTestId("risk-issue-form");
  await expect(form).toBeVisible();
  // Seeded id 1 carries HTML; the editor shows its words, not its markup.
  await expect(form).toContainText("project id was missing");
  await expect(form.getByLabel(messages.risksIssues.status, { exact: true })).toHaveValue("Closed");
});

test("edit a seeded record — the new text persists in the list", async ({ page }) => {
  await page.goto("/projects/2/risks-issues?id=2");
  const form = page.getByTestId("risk-issue-form");
  await expect(form).toBeVisible();
  const updated = `Updated ${Date.now()}`;
  await fillDescription(form, updated);
  await page.getByTestId("risk-issue-save").click();
  await expect(
    page.getByTestId("toast-success").filter({ hasText: messages.feedback.saved }).first(),
  ).toBeVisible();
  await expect(form).toHaveCount(0);

  await page.goto(`/projects/2/risks-issues?q=${encodeURIComponent(updated)}`);
  await expectListed(page, updated);
});

test("category filter — Risk only shows Risk rows", async ({ page }) => {
  // A Risk of this run's own, so the filter has something to keep.
  const description = `E2E filter risk ${Date.now()}`;
  await page.goto("/projects/2/risks-issues?id=new");
  const form = page.getByTestId("risk-issue-form");
  await expect(form).toBeVisible();
  await fillDescription(form, description);
  await form.getByLabel(messages.risksIssues.category, { exact: true }).selectOption("Risk");
  await page.getByTestId("risk-issue-save").click();
  await expect(form).toHaveCount(0);

  await page.goto("/projects/2/risks-issues");
  await page.getByRole("heading", { name: messages.risksIssues.title }).waitFor();
  await page.getByTestId("filter-category").selectOption("Risk");
  await expect(page).toHaveURL(/category=Risk/);

  await expectListed(page, description);
  // Both seeded records are Issues, so neither survives the Risk filter.
  await expectNotListed(page, "project id was missing");
});

test("axe scan on the risks & issues list has no serious or critical violations", async ({
  page,
}) => {
  await page.goto("/projects/2/risks-issues");
  await expect(page.getByRole("heading", { name: messages.risksIssues.title })).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) =>
    ["serious", "critical"].includes(v.impact ?? ""),
  );
  expect(serious).toEqual([]);
});

test("axe scan on the sheet has no serious or critical violations", async ({ page }) => {
  await page.goto("/projects/2/risks-issues?id=1");
  await expect(page.getByTestId("risk-issue-form")).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) =>
    ["serious", "critical"].includes(v.impact ?? ""),
  );
  expect(serious).toEqual([]);
});
