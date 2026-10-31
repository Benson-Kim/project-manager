import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { messages } from "../src/lib/messages";
import { expectListed, expectNotListed, openListed } from "./support/datasheet";

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
  ).toBeVisible({ timeout: 15_000 });
  await expect(form).toHaveCount(0);

  await page.goto(`/projects/2/parking-lot?q=${encodeURIComponent(itemText)}`);
  await expectListed(page, itemText);
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

test("edit parking lot item happy path — updates text and shows toast", async ({ page }) => {
  await page.goto("/projects/2/parking-lot?id=3");
  const form = page.getByTestId("parking-lot-form");
  await expect(form).toBeVisible();
  const newText = `E2E updated item ${Date.now()}`;
  await form.getByLabel(messages.parkingLot.item).fill(newText);
  await page.getByTestId("parking-lot-save").click();
  await expect(
    page.getByTestId("toast-success").filter({ hasText: messages.feedback.saved }).first(),
  ).toBeVisible({ timeout: 15_000 });
  await expect(form).toHaveCount(0);

  await page.goto(`/projects/2/parking-lot?q=${encodeURIComponent(newText)}`);
  await expectListed(page, newText);
});

test("delete parking lot item happy path — item removed from list", async ({ page }) => {
  // Create a disposable item first
  const itemText = `E2E delete target ${Date.now()}`;
  await page.goto("/projects/2/parking-lot");
  await page.getByTestId("new-parking-lot-item").click();
  const form = page.getByTestId("parking-lot-form");
  await expect(form).toBeVisible();
  await form.getByLabel(messages.parkingLot.item).fill(itemText);
  await page.getByTestId("parking-lot-save").click();
  await expect(
    page.getByTestId("toast-success").filter({ hasText: messages.feedback.created }).first(),
  ).toBeVisible({ timeout: 15_000 });

  // Open the newly created item by searching for it
  await page.goto(`/projects/2/parking-lot?q=${encodeURIComponent(itemText)}`);
  await openListed(page, itemText);
  const editForm = page.getByTestId("parking-lot-form");
  await expect(editForm).toBeVisible();

  // Delete it
  await page.getByTestId("parking-lot-delete").click();
  await page.getByRole("button", { name: messages.actions.delete }).last().click();
  await expect(
    page.getByTestId("toast-success").filter({ hasText: messages.feedback.deleted }).first(),
  ).toBeVisible({ timeout: 15_000 });
  await expect(editForm).toHaveCount(0);

  // Confirm it is gone
  await page.goto(`/projects/2/parking-lot?q=${encodeURIComponent(itemText)}`);
  await expectNotListed(page, itemText);
});

test("new item with followUpActions and owner — saved and visible on reopen", async ({ page }) => {
  const itemText = `E2E fields item ${Date.now()}`;
  await page.goto("/projects/2/parking-lot");
  await page.getByTestId("new-parking-lot-item").click();
  const form = page.getByTestId("parking-lot-form");
  await expect(form).toBeVisible();
  await form.getByLabel(messages.parkingLot.item).fill(itemText);
  await form.getByLabel(messages.parkingLot.followUpActions).fill("Follow up with team");
  await form.getByLabel(messages.parkingLot.owner).fill("Alice");
  await page.getByTestId("parking-lot-save").click();
  await expect(
    page.getByTestId("toast-success").filter({ hasText: messages.feedback.created }).first(),
  ).toBeVisible({ timeout: 15_000 });

  // Open the saved item and verify values persisted
  await page.goto(`/projects/2/parking-lot?q=${encodeURIComponent(itemText)}`);
  await openListed(page, itemText);
  const editForm = page.getByTestId("parking-lot-form");
  await expect(editForm).toBeVisible();
  await expect(editForm.getByLabel(messages.parkingLot.followUpActions)).toHaveText(
    "Follow up with team",
  );
  await expect(editForm.getByLabel(messages.parkingLot.owner)).toHaveValue("Alice");
});

test("status list — a Resolved item shows its status and strike styling", async ({ page }) => {
  // Open seeded item 5 (Active) and resolve it (migration 031: Status is a managed list)
  await page.goto("/projects/2/parking-lot?id=5");
  const form = page.getByTestId("parking-lot-form");
  await expect(form).toBeVisible();
  const status = form.getByLabel(messages.parkingLot.status);
  await status.selectOption(messages.parkingLot.resolved);
  await expect(status).toHaveValue(messages.parkingLot.resolved);
  await page.getByTestId("parking-lot-save").click();
  await expect(
    page.getByTestId("toast-success").filter({ hasText: messages.feedback.saved }).first(),
  ).toBeVisible({ timeout: 15_000 });

  // After save, the card shows the Resolved badge and the struck-through item.
  await page.goto("/projects/2/parking-lot?view=grid&status=Resolved");
  const grid = page.getByTestId("data-view-grid");
  await expect(grid.getByText(messages.parkingLot.resolved).first()).toBeVisible();
  await expect(grid.locator("p.line-through").first()).toBeVisible();
});

test("axe scan on the parking lot list has no serious or critical violations", async ({ page }) => {
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
