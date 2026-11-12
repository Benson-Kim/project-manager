import { expect, test, type Page } from "@playwright/test";
import { messages } from "../src/lib/messages";

const M = messages.checklists;
const C = messages.customColumns;
const D = messages.datasheet;

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const cell = (column: string, row: string) =>
  new RegExp(`^${escapeRegExp(D.cellLabel(column, row))}$`);

async function createProject(page: Page): Promise<string> {
  await page.goto("/projects/new");
  await page.getByLabel(messages.projects.name).fill(`E2E checklist project ${Date.now()}`);
  await page.getByTestId("project-save").click();
  await page.waitForURL(/\/projects\/\d+/);
  return new URL(page.url()).pathname.split("/")[2]!;
}

async function createChecklist(page: Page, projectId: string, name: string) {
  await page.goto(`/projects/${projectId}/checklists`);
  await expect(page.getByText(M.none)).toBeVisible();
  await page.getByTestId("checklist-name").fill(name);
  await page.getByTestId("checklist-save").click();
  await expect(page).toHaveURL(/\/checklists\?checklist=\d+$/, { timeout: 30_000 });
  await page.goto(`${page.url()}&view=list`);
  await expect(page.getByTestId("datasheet-add-row")).toBeVisible();
}

async function addColumn(page: Page, name: string, kind: string, action?: string) {
  await page.getByTestId("add-column").click();
  const dialog = page.getByRole("dialog", { name: C.addColumnTitle });
  await dialog.getByTestId("add-column-name").fill(name);
  await dialog.getByTestId("add-column-kind").selectOption(kind);
  if (action) await dialog.getByTestId("add-column-action").selectOption(action);
  await dialog.getByTestId("add-column-save").click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole("columnheader", { name: new RegExp(escapeRegExp(name)) }),
  ).toBeVisible();
}

async function addItem(page: Page, title: string) {
  const field = page
    .getByTestId("datasheet-add-row")
    .getByRole("textbox", { name: D.newEntryField(M.item) });
  await field.fill(title);
  await field.press("Enter");
  await expect(page.getByRole("textbox", { name: cell(M.item, title) })).toHaveValue(title, {
    timeout: 30_000,
  });
}

test.describe("checklists (ADR-0066)", () => {
  test("columns of every kind are added, filled, renamed and kept across a reload", async ({
    page,
  }) => {
    const projectId = await createProject(page);
    await createChecklist(page, projectId, `Go-live ${Date.now()}`);

    await addColumn(page, "Due", "date");
    await addColumn(page, "Note", "text");
    await addColumn(page, "Spec", "document");
    await addColumn(page, "Approval", "action", "signoff");
    await addColumn(page, "Follow up", "action", "todo");

    const title = `Sign the contract ${Date.now()}`;
    await addItem(page, title);

    const due = page.getByLabel(cell("Due", title));
    await due.fill("2026-12-01");
    await due.press("Enter");
    const note = page.getByRole("textbox", { name: cell("Note", title) });
    await note.fill("Ask legal first");
    await note.press("Enter");
    await expect(page.getByTestId("live-announcer")).toHaveText(D.saved("Note"), {
      timeout: 30_000,
    });

    const row = page
      .getByRole("row")
      .filter({ has: page.getByRole("textbox", { name: cell(M.item, title) }) });

    // A link must be http or https; anything else is refused before it is saved.
    await row.getByTestId("custom-cell-link-edit").click();
    const linkDialog = page.getByRole("dialog", { name: "Spec" });
    await linkDialog.getByTestId("custom-cell-link-input").fill("javascript:alert(1)");
    await linkDialog.getByTestId("custom-cell-link-save").click();
    await expect(linkDialog.getByText(C.badLink)).toBeVisible();
    await linkDialog.getByTestId("custom-cell-link-input").fill("example.com/spec");
    await linkDialog.getByTestId("custom-cell-link-save").click();
    await expect(linkDialog).toBeHidden();
    const link = row.getByTestId("custom-cell-link");
    await expect(link).toHaveAttribute("href", "https://example.com/spec");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");

    await row.getByTestId("custom-cell-signoff").click();
    await expect(row.getByTestId("custom-cell-signed")).toBeVisible({ timeout: 30_000 });
    await row.getByTestId("custom-cell-todo").click();
    await expect(row.getByTestId("custom-cell-todo-link")).toBeVisible({ timeout: 30_000 });

    // The tick shows at once; who ticked it comes back with the saved row.
    await row.getByTestId("checklist-done").check();
    await expect(row.getByTestId("checklist-done")).toBeChecked();
    await expect(row.getByTestId("checklist-done")).toHaveAttribute("title", /^Done by /, {
      timeout: 30_000,
    });

    // Renaming a column changes its name only: every value stays under it.
    await page.getByTestId("manage-columns").click();
    const columns = page.getByTestId("columns-dialog");
    // Found by its saved name: the name box itself shows what is typed.
    const noteRow = columns.getByTestId("columns-dialog-row").filter({
      has: page.getByRole("button", { name: `${C.moveLeft}: Note`, exact: true }),
    });
    await noteRow.getByTestId("columns-dialog-name").fill("Comment");
    await noteRow.getByTestId("columns-dialog-save").click();
    await expect(
      columns.getByRole("button", { name: `${C.moveLeft}: Comment`, exact: true }),
    ).toBeVisible({ timeout: 30_000 });
    // The open dialog hides the sheet behind it, so its headers show once it closes.
    await page.keyboard.press("Escape");
    await expect(columns).toBeHidden();
    await expect(page.getByRole("columnheader", { name: /Comment/ })).toBeVisible({
      timeout: 30_000,
    });

    await page.reload();
    const reloaded = page.getByRole("row").filter({
      has: page.getByRole("textbox", { name: cell(M.item, title) }),
    });
    await expect(page.getByLabel(cell("Due", title))).toHaveValue("2026-12-01");
    await expect(page.getByRole("textbox", { name: cell("Comment", title) })).toHaveValue(
      "Ask legal first",
    );
    await expect(reloaded.getByTestId("custom-cell-link")).toHaveAttribute(
      "href",
      "https://example.com/spec",
    );
    await expect(reloaded.getByTestId("custom-cell-signed")).toBeVisible();
    await expect(reloaded.getByTestId("custom-cell-todo-link")).toBeVisible();
    await expect(reloaded.getByTestId("checklist-done")).toBeChecked();

    // The to-do the button made is a real to-do of this project.
    await reloaded.getByTestId("custom-cell-todo-link").click();
    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/todos\\?id=\\d+`));
  });

  test("search finds items by title and deleting a column asks first", async ({ page }) => {
    const projectId = await createProject(page);
    await createChecklist(page, projectId, `Search ${Date.now()}`);
    await addColumn(page, "Owner", "text");
    await addItem(page, "Book the venue");
    await addItem(page, "Order the badges");

    await page.getByTestId("checklist-search").fill("venue");
    await expect(page.getByRole("textbox", { name: cell(M.item, "Book the venue") })).toBeVisible();
    await expect(page.getByRole("textbox", { name: cell(M.item, "Order the badges") })).toHaveCount(
      0,
    );

    await page.getByTestId("manage-columns").click();
    await page.getByTestId("columns-dialog-delete").click();
    const confirm = page.getByRole("dialog", { name: C.deleteColumn });
    await expect(confirm.getByText(C.deleteColumnPrompt("Owner"))).toBeVisible();
    await confirm.getByRole("button", { name: messages.actions.delete }).click();
    await expect(page.getByRole("columnheader", { name: /Owner/ })).toHaveCount(0, {
      timeout: 30_000,
    });
  });
});
