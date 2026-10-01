import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { messages } from "../src/lib/messages";

/**
 * Parking lot module (#18) — project-scoped route /projects/2/parking-lot.
 * Create happy path in the URL-synced sheet, validation failure, axe scans on
 * list + sheet form. Runs as e2e-pm (storage state from auth.setup.ts — no
 * extra logins, LESSONS §12). Seeded parking lot item 3 = "1- Per Mustapha of IT…" on project 2.
 */

test("create parking lot item happy path — appears in the list", async ({ page }) => {
  const itemText = `E2E parking lot item ${Date.now()}`;
  await page.goto("/projects/2/parking-lot");
  await page.getByTestId("new-parking-lot-item").click();
  const form = page.getByTestId("parking-lot-form");
  await expect(form).toBeVisible();
  await form.getByLabel(messages.parkingLot.item).fill(itemText);
  await page.getByTestId("parking-lot-save").click();
  await expect(
    page.getByTestId("toast-success").filter({ hasText: messages.feedback.created }).first(),
  ).toBeVisible();
  await expect(form).toHaveCount(0);

  await page.goto(`/projects/2/parking-lot?q=${encodeURIComponent(itemText)}`);
  await expect(page.getByText(itemText).first()).toBeVisible();
});

test("validation failure — empty item shows inline error and focuses the summary", async ({
  page,
}) => {
  await page.goto("/projects/2/parking-lot?id=new");
  const form = page.getByTestId("parking-lot-form");
  await expect(form).toBeVisible();
  await form.getByLabel(messages.parkingLot.item).fill("   ");
  await form.getByLabel(messages.parkingLot.item).blur();
  await page.getByTestId("parking-lot-save").click();
  await expect(page.getByText(messages.parkingLot.itemRequired).first()).toBeVisible();
  const summary = page.getByRole("alert").filter({ hasText: messages.errors.summaryTitle });
  await expect(summary).toBeVisible();
  await expect(summary).toBeFocused();
});

test("sheet is URL-synced — deep link ?id= opens the seeded item", async ({ page }) => {
  await page.goto("/projects/2/parking-lot?id=3");
  const form = page.getByTestId("parking-lot-form");
  await expect(form).toBeVisible();
  // Seeded item 3 has ParkingLotItem starting with "1- Per Mustapha"
  await expect(form.getByLabel(messages.parkingLot.item)).toHaveValue(/Per Mustapha/);
});

test("axe scan on the parking lot list has no serious or critical violations", async ({
  page,
}) => {
  await page.goto("/projects/2/parking-lot");
  await expect(page.getByRole("heading", { name: messages.parkingLot.title })).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) =>
    ["serious", "critical"].includes(v.impact ?? ""),
  );
  expect(serious).toEqual([]);
});

test("axe scan on the parking lot sheet has no serious or critical violations", async ({
  page,
}) => {
  await page.goto("/projects/2/parking-lot?id=3");
  await expect(page.getByTestId("parking-lot-form")).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) =>
    ["serious", "critical"].includes(v.impact ?? ""),
  );
  expect(serious).toEqual([]);
});
