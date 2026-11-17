import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { messages } from "../src/lib/messages";
import { escapeRegExp, expectListed } from "./support/datasheet";

/**
 * A save in one window shows in the app's other open windows without a reload. Two pages of one
 * browser context stand in for two app windows. The watching window is brought back to the
 * front after the save, so it refreshes whether the browser treats it as on screen or hidden.
 */
async function watch(context: BrowserContext, url: string): Promise<Page> {
  const other = await context.newPage();
  await other.goto(url);
  return other;
}

async function created(page: Page) {
  await expect(
    page.getByTestId("toast-success").filter({ hasText: messages.feedback.created }).first(),
  ).toBeVisible({ timeout: 15_000 });
}

test("a new to-do shows in the other window", async ({ page, context }) => {
  const title = `E2E sync todo ${Date.now()}`;
  const other = await watch(context, `/projects/2/todos?q=${encodeURIComponent(title)}`);
  await page.bringToFront();
  await page.goto("/projects/2/todos?id=new");
  await page.getByTestId("todo-item-form").getByLabel(messages.todoItems.todoItem).fill(title);
  await page.getByTestId("todo-item-save").click();
  await created(page);
  await other.bringToFront();
  await expectListed(other, title);
});

test("a new risk shows in the other window", async ({ page, context }) => {
  const description = `E2E sync risk ${Date.now()}`;
  const other = await watch(
    context,
    `/projects/2/risks-issues?q=${encodeURIComponent(description)}`,
  );
  await page.bringToFront();
  await page.goto("/projects/2/risks-issues?id=new");
  const editor = page
    .getByTestId("risk-issue-form")
    .getByRole("textbox", { name: messages.risksIssues.description });
  await editor.click();
  await editor.fill(description);
  await page.getByTestId("risk-issue-save").click();
  await created(page);
  await other.bringToFront();
  await expectListed(other, description);
});

test("a new requirement shows in the other window", async ({ page, context }) => {
  const register = "/projects/2/requirements?view=list";
  const wording = `E2E sync requirement ${Date.now()}`;
  const other = await watch(context, `${register}&q=${encodeURIComponent(wording)}`);
  await page.bringToFront();
  await page.goto(`${register}&id=new`);
  const form = page.getByTestId("requirement-form");
  await form.getByLabel(messages.requirements.requirement, { exact: true }).fill(wording);
  await page.getByTestId("requirement-save").click();
  await created(page);
  await other.bringToFront();
  await expectListed(other, wording);
});

test("a new board card shows in the other window", async ({ page, context }) => {
  const B = messages.boards;
  const stamp = Date.now();
  await page.goto("/projects/2/boards");
  await page.getByRole("button", { name: B.newBoard }).first().click();
  const create = page.getByRole("dialog");
  await create.getByLabel(B.name, { exact: true }).fill(`E2E sync board ${stamp}`);
  await create.getByRole("button", { name: messages.actions.save }).click();
  await page.waitForURL(/\/projects\/2\/boards\/\d+$/);
  const other = await watch(context, page.url());
  await page.bringToFront();

  await page.getByRole("button", { name: B.ui.newCard }).first().click();
  const card = page.getByRole("dialog");
  const title = card.getByLabel(B.ui.cardTitle, { exact: true });
  await title.fill(`E2E sync card ${stamp}`);
  await title.blur();
  await card.getByRole("button", { name: messages.actions.save }).click();
  await expect(card).toBeHidden();
  await other.bringToFront();
  await expect(
    other.getByRole("button", { name: `E2E sync card ${stamp}`, exact: true }),
  ).toBeVisible({ timeout: 15_000 });
});

test("a new checklist row shows in the other window", async ({ page, context }) => {
  const M = messages.checklists;
  const item = `E2E sync row ${Date.now()}`;
  await page.goto("/projects/new");
  await page.getByLabel(messages.projects.name).fill(`E2E sync project ${Date.now()}`);
  await page.getByTestId("project-save").click();
  await page.waitForURL(/\/projects\/\d+/);
  const projectId = new URL(page.url()).pathname.split("/")[2]!;
  await page.goto(`/projects/${projectId}/checklists`);
  await page.getByTestId("checklist-name").fill(`E2E sync checklist ${Date.now()}`);
  await page.getByTestId("checklist-save").click();
  await expect(page).toHaveURL(/\/checklists\?checklist=\d+$/, { timeout: 30_000 });
  await page.goto(`${page.url()}&view=list`);
  const other = await watch(context, page.url());
  await page.bringToFront();

  const field = page
    .getByTestId("datasheet-add-row")
    .getByRole("textbox", { name: messages.datasheet.newEntryField(M.item) });
  await field.fill(item);
  await field.press("Enter");
  const row = new RegExp(`^${escapeRegExp(messages.datasheet.cellLabel(M.item, item))}$`);
  await expect(page.getByRole("textbox", { name: row })).toHaveValue(item, { timeout: 30_000 });
  await other.bringToFront();
  await expect(other.getByRole("textbox", { name: row })).toHaveValue(item, { timeout: 15_000 });
});
