import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { messages } from "../src/lib/messages";
import { closeAlarmToast } from "./support/alarms";
import { escapeRegExp } from "./support/datasheet";

/**
 * Boards (ADR-0038): a project board is created inside its project, takes a card, and imports
 * register requirements of every type as cards. Importing the same requirements again adds
 * nothing. Runs as e2e-pm on seeded project 2; the procs' own rules are proven by
 * db/tests/boards-procs.cjs.
 */

const B = messages.boards;
const R = messages.requirements;
const REGISTER = "/projects/2/requirements?view=list";

const cellName = (column: string, row: string) =>
  new RegExp(`^${escapeRegExp(messages.datasheet.cellLabel(column, row))}$`);

async function addRequirement(page: Page, type: string, text: string): Promise<void> {
  const addRow = page.getByTestId("datasheet-add-row");
  const field = addRow.getByRole("textbox", {
    name: messages.datasheet.newEntryField(R.requirement),
  });
  await addRow
    .getByRole("combobox", { name: messages.datasheet.newEntryField(R.type) })
    .selectOption(type);
  await field.fill(text);
  await field.press("Enter");
  await expect(field).toHaveValue("");
  await expect(page.getByRole("textbox", { name: cellName(R.requirement, text) })).toBeVisible();
}

async function axe(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
}

async function importRequirements(page: Page, stamp: number): Promise<void> {
  await page.getByRole("button", { name: B.ui.packageTitle }).click();
  const dialog = page.getByRole("dialog");
  const picker: Locator = dialog.getByRole("combobox").last();
  for (let i = 0; i < 2; i++) {
    await picker.fill(String(stamp));
    await dialog.getByRole("option").first().click();
  }
  await expect(dialog.getByRole("button", { name: /^Remove / })).toHaveCount(2);
  await dialog.getByRole("button", { name: messages.actions.save }).click();
  await expect(dialog).toBeHidden();
}

test("a project board takes a card and imports FR and NFR requirements once", async ({ page }) => {
  const stamp = Date.now();
  const fr = `E2E board functional ${stamp}`;
  const nfr = `E2E board quality ${stamp}`;

  await page.goto(REGISTER);
  await expect(page.getByRole("heading", { name: R.title })).toBeVisible();
  await closeAlarmToast(page);
  await addRequirement(page, "FR", fr);
  await addRequirement(page, "NFR", nfr);

  await page.goto("/projects/2/boards");
  await page.getByRole("button", { name: B.newBoard }).first().click();
  const create = page.getByRole("dialog");
  await create.getByLabel(B.name, { exact: true }).fill(`E2E board ${stamp}`);
  await create.getByRole("button", { name: messages.actions.save }).click();
  await page.waitForURL(/\/projects\/2\/boards\/\d+$/);
  await expect(page.getByRole("heading", { name: `E2E board ${stamp}` })).toBeVisible();

  await page.getByRole("button", { name: B.ui.newCard }).first().click();
  const card = page.getByRole("dialog");
  await card.getByLabel(B.ui.cardTitle, { exact: true }).fill(`E2E card ${stamp}`);
  await card.getByRole("button", { name: messages.actions.save }).click();
  await expect(card).toBeHidden();
  await expect(page.getByRole("button", { name: `E2E card ${stamp}` })).toBeVisible();

  await importRequirements(page, stamp);
  const lane = page.getByRole("region", { name: B.defaultColumns.todo });
  await expect(lane.getByRole("button", { name: fr })).toBeVisible();
  await expect(lane.getByRole("button", { name: nfr })).toBeVisible();
  await expect(lane.getByText(/^FR-\d+/)).toBeVisible();
  await expect(lane.getByText(/^NFR-\d+/)).toBeVisible();
  await axe(page);

  await importRequirements(page, stamp);
  await expect(lane.getByRole("button", { name: fr })).toHaveCount(1);
  await expect(lane.getByRole("button", { name: nfr })).toHaveCount(1);

  await page.goto(`${page.url()}?view=plan`);
  await expect(page.getByRole("region", { name: B.backlog })).toBeVisible();
  await axe(page);
});
