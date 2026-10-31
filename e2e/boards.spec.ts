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
  const picker: Locator = dialog.getByRole("combobox", { name: B.ui.requirements, exact: true });
  for (const wording of [`E2E board functional ${stamp}`, `E2E board quality ${stamp}`]) {
    await picker.fill(wording);
    await dialog.getByRole("option").filter({ hasText: wording }).click();
  }
  await expect(dialog.getByRole("button", { name: /^Remove / })).toHaveCount(2);
  await dialog.getByRole("button", { name: messages.actions.save }).click();
  await expect(dialog).toBeHidden();
}

test("a project board takes a card and imports FR and NFR requirements once", async ({ page }) => {
  const stamp = Date.now();
  const fr = `E2E board functional ${stamp}`;
  const nfr = `E2E board quality ${stamp}`;

  await page.goto(`${REGISTER}&q=${stamp}`);
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
  const title = card.getByLabel(B.ui.cardTitle, { exact: true });
  await title.fill(`E2E card ${stamp}`);
  await title.blur();
  await card.getByRole("button", { name: messages.actions.save }).click();
  await expect(card).toBeHidden();
  await expect(page.getByRole("button", { name: `E2E card ${stamp}`, exact: true })).toBeVisible();

  await importRequirements(page, stamp);
  const lane = page.getByRole("region", { name: B.defaultColumns.todo });
  await expect(lane.getByRole("button", { name: fr, exact: true })).toBeVisible();
  await expect(lane.getByRole("button", { name: nfr, exact: true })).toBeVisible();
  await expect(lane.getByText(/^FR-\d+/)).toBeVisible();
  await expect(lane.getByText(/^NFR-\d+/)).toBeVisible();
  await axe(page);

  await importRequirements(page, stamp);
  await expect(lane.getByRole("button", { name: fr, exact: true })).toHaveCount(1);
  await expect(lane.getByRole("button", { name: nfr, exact: true })).toHaveCount(1);

  await page.goto(`${page.url()}?view=plan`);
  await expect(page.getByRole("region", { name: B.backlog })).toBeVisible();
  await axe(page);
});

test("a card links a requirement, ticks it met and unlinks it", async ({ page }) => {
  const stamp = Date.now();
  const wording = `E2E link ${stamp}`;
  const cardTitle = `E2E link card ${stamp}`;
  await page.goto(`${REGISTER}&q=${stamp}`);
  await closeAlarmToast(page);
  await addRequirement(page, "FR", wording);

  await page.goto("/projects/2/boards");
  await page.getByRole("button", { name: B.newBoard }).first().click();
  const create = page.getByRole("dialog");
  await create.getByLabel(B.name, { exact: true }).fill(`E2E link board ${stamp}`);
  await create.getByRole("button", { name: messages.actions.save }).click();
  await page.waitForURL(/\/projects\/2\/boards\/\d+$/);
  await page.getByRole("button", { name: B.ui.newCard }).first().click();
  const created = page.getByRole("dialog");
  await created.getByLabel(B.ui.cardTitle, { exact: true }).fill(cardTitle);
  await created.getByRole("button", { name: messages.actions.save }).click();
  await expect(created).toBeHidden();

  await page.getByRole("button", { name: cardTitle, exact: true }).click();
  const sheet = page.getByRole("dialog");
  const section = sheet.getByTestId("card-requirement");
  const picker = section.getByRole("combobox", { name: B.requirement.pick, exact: true });
  await picker.fill(wording);
  await section.getByRole("option").filter({ hasText: wording }).click();
  await section.getByRole("button", { name: B.requirement.link, exact: true }).click();
  const met = section.getByRole("checkbox", { name: /^FR-[\d.]+ met$/ });
  await expect(met).not.toBeChecked();
  await met.check();
  await expect(met).toBeChecked();
  await expect(section.getByText(wording)).toHaveClass(/line-through/);
  await axe(page);

  await section.getByRole("button", { name: B.requirement.unlink, exact: true }).click();
  await expect(picker).toBeVisible();
  await sheet.getByRole("button", { name: messages.actions.save }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByRole("button", { name: cardTitle, exact: true })).toBeVisible();
});

test("Kanban: dragging a card shows it in the lane under the pointer, then saves it there", async ({
  page,
}) => {
  const stamp = Date.now();
  const name = `E2E drag ${stamp}`;
  await page.goto("/projects/2/boards");
  await page.getByRole("button", { name: B.newBoard }).first().click();
  const create = page.getByRole("dialog");
  await create.getByLabel(B.name, { exact: true }).fill(`E2E drag board ${stamp}`);
  await create.getByRole("button", { name: messages.actions.save }).click();
  await page.waitForURL(/\/projects\/2\/boards\/\d+$/);
  await closeAlarmToast(page);

  await page.getByRole("button", { name: B.ui.newCard }).first().click();
  const sheet = page.getByRole("dialog");
  const title = sheet.getByLabel(B.ui.cardTitle, { exact: true });
  await title.fill(name);
  await title.blur();
  await sheet.getByRole("button", { name: messages.actions.save }).click();
  await expect(sheet).toBeHidden();

  const todo = page.getByRole("region", { name: B.defaultColumns.todo });
  const doing = page.getByRole("region", { name: B.defaultColumns.doing });
  await expect(todo.getByRole("button", { name, exact: true })).toBeVisible();
  // The whole card drags, not only its grip: this press starts on the card's title.
  const from = (await todo.getByRole("button", { name, exact: true }).boundingBox())!;
  const to = (await doing.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + 60, { steps: 12 });
  // Live placement: the card already sits in the lane under the pointer, and the lifted copy is
  // a see-through ghost with faded edges, hidden from assistive technology.
  await expect(doing.getByRole("button", { name, exact: true })).toBeVisible();
  await expect(todo.getByRole("button", { name, exact: true })).toHaveCount(0);
  const ghost = page.locator("body > article[aria-hidden='true']");
  await expect(ghost).toHaveCount(1);
  await expect(ghost).toHaveCSS("opacity", "0.7");
  await expect(ghost).toHaveCSS("mask-image", /linear-gradient/);
  await page.mouse.up();
  await expect(ghost).toHaveCount(0);
  await expect(doing.getByRole("button", { name, exact: true })).toBeVisible();
  // Letting go on the title is the end of the drag, not a click that opens the card.
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await expect(async () => {
    await page.reload();
    await expect(
      page
        .getByRole("region", { name: B.defaultColumns.doing })
        .getByRole("button", { name, exact: true }),
    ).toBeVisible({ timeout: 2000 });
  }).toPass();
});

test("Kanban: a deliverable card, its stats, filters, JSON copy and drawer", async ({
  page,
  context,
}) => {
  const K = B.kanban;
  const stamp = Date.now();
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/projects/2/boards");
  await page.getByRole("button", { name: B.newBoard }).first().click();
  const create = page.getByRole("dialog");
  await create.getByLabel(B.name, { exact: true }).fill(`E2E kanban ${stamp}`);
  await create.getByRole("button", { name: messages.actions.save }).click();
  await page.waitForURL(/\/projects\/2\/boards\/\d+$/);
  await closeAlarmToast(page);

  await page.getByRole("button", { name: B.ui.newCard }).first().click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("radio", { name: B.source.deliverable }).check();
  const picker = sheet.getByRole("combobox", { name: B.source.deliverables, exact: true });
  await picker.click();
  const option = sheet.getByRole("option").first();
  const label = ((await option.textContent()) ?? "").trim();
  await option.click();
  await sheet.getByRole("button", { name: messages.actions.save }).click();
  await expect(sheet).toBeHidden();

  const lane = page.getByRole("region", { name: B.defaultColumns.todo });
  await expect(lane.getByText(K.kinds.deliverable, { exact: true })).toBeVisible();
  await expect(page.getByTestId("kanban-total")).toHaveText("1");
  await expect(page.getByTestId("kanban-count")).toHaveText(K.showing(1));

  await page.getByTestId("kanban-kind").selectOption("free");
  await expect(page.getByTestId("kanban-count")).toHaveText(K.showing(0));
  await page.getByTestId("kanban-clear").click();
  await expect(page.getByTestId("kanban-count")).toHaveText(K.showing(1));

  await page.getByTestId("kanban-copy-json").click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(JSON.parse(copied)).toEqual([expect.objectContaining({ kind: "deliverable" })]);
  await axe(page);

  const title = label.replace(/^[\d.]+\s+/, "");
  await lane.getByRole("button", { name: title, exact: true }).click();
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByTestId("card-deliverable")).toBeVisible();
  await expect(drawer.getByRole("progressbar", { name: B.drawer.readiness })).toBeVisible();
  await axe(page);
});
