import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { messages } from "../src/lib/messages";
import { escapeRegExp } from "./support/datasheet";

const M = messages.checklists;
const B = messages.boards;
const D = messages.datasheet;

const cell = (column: string, row: string) =>
  new RegExp(`^${escapeRegExp(D.cellLabel(column, row))}$`);

async function axe(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
}

async function checklistWithItems(page: Page, name: string, items: string[]): Promise<string> {
  await page.goto("/projects/new");
  await page.getByLabel(messages.projects.name).fill(`E2E board-from-checklist ${Date.now()}`);
  await page.getByTestId("project-save").click();
  await page.waitForURL(/\/projects\/\d+/);
  const projectId = new URL(page.url()).pathname.split("/")[2]!;

  await page.goto(`/projects/${projectId}/checklists`);
  await page.getByTestId("checklist-name").fill(name);
  await page.getByTestId("checklist-save").click();
  await expect(page).toHaveURL(/\/checklists\?checklist=\d+$/, { timeout: 30_000 });
  await page.goto(`${page.url()}&view=list`);
  for (const title of items) {
    const field = page
      .getByTestId("datasheet-add-row")
      .getByRole("textbox", { name: D.newEntryField(M.item) });
    await field.fill(title);
    await field.press("Enter");
    await expect(page.getByRole("textbox", { name: cell(M.item, title) })).toHaveValue(title, {
      timeout: 30_000,
    });
  }
  return projectId;
}

async function makeBoard(page: Page, name: string, method: "kanban" | "scrum") {
  await page.getByTestId("checklist-menu").click();
  await page.getByTestId("checklist-board").click();
  const dialog = page.getByRole("dialog", { name: M.makeBoardTitle });
  await expect(dialog.getByTestId("checklist-board-name")).toHaveValue(name);
  await dialog.getByTestId(`checklist-board-${method}`).check();
  await axe(page);
  await dialog.getByTestId("checklist-board-save").click();
  await page.waitForURL(/\/boards\/\d+/, { timeout: 30_000 });
}

test.describe("a board made from a checklist", () => {
  test("Kanban: each item becomes a card, and a done item lands in the done column", async ({
    page,
  }) => {
    const stamp = Date.now();
    const name = `Launch ${stamp}`;
    const open = `Book the venue ${stamp}`;
    const done = `Send invites ${stamp}`;
    await checklistWithItems(page, name, [open, done]);

    const row = page
      .getByRole("row")
      .filter({ has: page.getByRole("textbox", { name: cell(M.item, done) }) });
    await row.getByTestId("checklist-done").check();
    await expect(row.getByTestId("checklist-done")).toHaveAttribute("title", /^Done by /, {
      timeout: 30_000,
    });

    await makeBoard(page, name, "kanban");
    const todo = page.getByRole("region", { name: B.defaultColumns.todo });
    const finished = page.getByRole("region", { name: B.defaultColumns.done });
    await expect(todo.getByRole("button", { name: open, exact: true })).toBeVisible();
    await expect(finished.getByRole("button", { name: done, exact: true })).toBeVisible();
    await expect(todo.getByRole("button", { name: done, exact: true })).toHaveCount(0);
    await axe(page);
  });

  test("Scrum: the cards go into a first sprint", async ({ page }) => {
    const stamp = Date.now();
    const name = `Sprint source ${stamp}`;
    await checklistWithItems(page, name, [`Write the brief ${stamp}`]);

    await makeBoard(page, name, "scrum");
    await page.goto(`${page.url()}?view=plan`);
    const sprint = page.getByRole("region", { name: B.firstSprintName });
    await expect(
      sprint.getByRole("button", { name: `Write the brief ${stamp}`, exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("region", { name: B.backlog })).not.toContainText(
      `Write the brief ${stamp}`,
    );
  });
});
