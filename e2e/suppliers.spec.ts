import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { messages } from "../src/lib/messages";

/**
 * Suppliers module (#7) — project-scoped route /projects/2/suppliers
 * (ADR-0018): create happy path in the URL-synced sheet, validation failure
 * (bad email), axe scans on list + sheet form. Runs as e2e-pm (storage state
 * from auth.setup.ts — no extra logins, LESSONS §12). Seeded supplier 1 =
 * Fiverr Company on project 2.
 */

test("create supplier happy path — appears in the list", async ({ page }) => {
  const supplierName = `E2E supplier ${Date.now()}`;
  await page.goto("/projects/2/suppliers");
  await page.getByTestId("new-supplier").click();
  const form = page.getByTestId("supplier-form");
  await expect(form).toBeVisible();
  await form.getByLabel(messages.suppliers.supplierName).fill(supplierName);
  await form.getByLabel(messages.suppliers.contractEndDate).fill("2027-03-31");
  await form.getByLabel(messages.suppliers.rating).selectOption("Good");
  await page.getByTestId("supplier-save").click();
  await expect(
    page.getByTestId("toast-success").filter({ hasText: messages.feedback.created }).first(),
  ).toBeVisible();
  await expect(form).toHaveCount(0); // sheet closed, ?id= cleared

  await page.goto(`/projects/2/suppliers?q=${encodeURIComponent(supplierName)}`);
  await expect(page.getByText(supplierName).first()).toBeVisible();
});

test("validation failure — bad email shows inline error and focuses the summary", async ({
  page,
}) => {
  await page.goto("/projects/2/suppliers?id=new");
  const form = page.getByTestId("supplier-form");
  await expect(form).toBeVisible();
  await form.getByLabel(messages.suppliers.supplierName).fill("Validation probe");
  const email = form.getByLabel(messages.suppliers.emailAddress);
  await email.fill("not-an-email");
  // Blur first: blur-validation re-renders and shifts layout; clicking Save
  // while that happens loses the click (submit never fires).
  await email.blur();
  await expect(page.getByText(messages.suppliers.invalidEmail).first()).toBeVisible();
  await page.getByTestId("supplier-save").click();
  const summary = page.getByRole("alert").filter({ hasText: messages.errors.summaryTitle });
  await expect(summary).toBeVisible();
  await expect(summary).toBeFocused();
});

test("sheet is URL-synced — deep link ?id= opens the seeded supplier", async ({ page }) => {
  await page.goto("/projects/2/suppliers?id=1");
  const form = page.getByTestId("supplier-form");
  await expect(form).toBeVisible();
  await expect(form.getByLabel(messages.suppliers.supplierName)).toHaveValue("Fiverr Company");
});

test("axe scan on the suppliers list has no serious or critical violations", async ({ page }) => {
  await page.goto("/projects/2/suppliers");
  await expect(page.getByRole("heading", { name: messages.suppliers.title })).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) =>
    ["serious", "critical"].includes(v.impact ?? ""),
  );
  expect(serious).toEqual([]);
});

test("axe scan on the supplier sheet has no serious or critical violations", async ({ page }) => {
  await page.goto("/projects/2/suppliers?id=1");
  await expect(page.getByTestId("supplier-form")).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) =>
    ["serious", "critical"].includes(v.impact ?? ""),
  );
  expect(serious).toEqual([]);
});
