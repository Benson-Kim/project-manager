import { expect, test, type Page } from "@playwright/test";
import { messages } from "../src/lib/messages";
import { escapeRegExp } from "./support/datasheet";

/**
 * Undo and Redo on every page (ADR-0063). Runs as e2e-pm, Manager on project 2. Each module makes
 * two changes in its list, takes both back, makes one again, and reads the saved value after a
 * reload: what the server holds, not what the page shows.
 */
const H = messages.pageHistory;
const newEntry = (column: string) => messages.datasheet.newEntryField(column);
const cell = (column: string, row: string) =>
  new RegExp(`^${escapeRegExp(messages.datasheet.cellLabel(column, row))}$`);

interface ModuleCase {
  name: string;
  path: string;
  /** The text column a new row is named in. */
  title: string;
  /** Selects the new-entry row needs before Enter adds the row. */
  required?: Record<string, string>;
  /** The select column the test changes twice. */
  change: string;
}

const CASES: ModuleCase[] = [
  {
    name: "to-dos",
    path: "/projects/2/todos",
    title: messages.todoItems.todoItem,
    change: messages.todoItems.priority,
  },
  {
    name: "key deliverables",
    path: "/projects/2/deliverables",
    title: messages.keyDeliverables.deliverable,
    required: { [messages.keyDeliverables.status]: "Pending" },
    change: messages.keyDeliverables.priority,
  },
];

async function addRow(page: Page, c: ModuleCase, name: string) {
  await page.goto(`${c.path}?view=list`);
  const row = page.getByTestId("datasheet-add-row");
  const field = row.getByRole("textbox", { name: newEntry(c.title) });
  await field.fill(name);
  for (const [column, value] of Object.entries(c.required ?? {})) {
    await row.getByRole("combobox", { name: newEntry(column) }).selectOption(value);
  }
  await field.press("Enter");
  await expect(field).toHaveValue("");
}

async function otherValues(page: Page, select: ReturnType<Page["getByRole"]>) {
  const now = await select.inputValue();
  const values = await select
    .locator("option")
    .evaluateAll((options) => options.map((o) => (o as HTMLOptionElement).value));
  return { now, choices: values.filter((v) => v !== "" && v !== now) };
}

for (const c of CASES) {
  test(`${c.name}: two changes, both undone, one redone, the server keeps the redone one`, async ({
    page,
  }) => {
    const name = `E2E undo ${c.name} ${Date.now()}`;
    await addRow(page, c, name);
    await page.goto(`${c.path}?view=list&q=${encodeURIComponent(name)}`);

    const undo = page.getByTestId("page-undo");
    const redo = page.getByTestId("page-redo");
    await expect(undo).toBeDisabled();
    await expect(redo).toBeDisabled();

    const select = page.getByRole("combobox", { name: cell(c.change, name) });
    const { now: original, choices } = await otherValues(page, select);
    const [first, second] = choices;
    expect(second).toBeTruthy();

    await select.selectOption(first);
    await expect(undo).toBeEnabled();
    await expect(undo).toHaveAttribute("title", new RegExp(escapeRegExp(H.undoWhat(c.change))));
    await select.selectOption(second);
    await expect(page.getByText(messages.datasheet.saved(c.change)).first()).toBeAttached();

    await undo.click();
    await expect(select).toHaveValue(first);
    await page.keyboard.press("Control+z");
    await expect(select).toHaveValue(original);
    await expect(undo).toBeDisabled();
    await expect(redo).toBeEnabled();

    await redo.click();
    await expect(select).toHaveValue(first);
    await expect(redo).toBeEnabled();

    await page.reload();
    await expect(page.getByRole("combobox", { name: cell(c.change, name) })).toHaveValue(first);
  });
}

test("a change someone else made since is never undone", async ({ page, browser }) => {
  const c = CASES[0];
  const name = `E2E undo conflict ${Date.now()}`;
  await addRow(page, c, name);
  const url = `${c.path}?view=list&q=${encodeURIComponent(name)}`;
  await page.goto(url);
  const select = page.getByRole("combobox", { name: cell(c.change, name) });
  const { choices } = await otherValues(page, select);
  await select.selectOption(choices[0]);
  await expect(page.getByTestId("page-undo")).toBeEnabled();

  const other = await browser.newContext({ storageState: await page.context().storageState() });
  const otherPage = await other.newPage();
  await otherPage.goto(url);
  await otherPage.getByRole("combobox", { name: cell(c.change, name) }).selectOption(choices[1]);
  await expect(otherPage.getByText(messages.datasheet.saved(c.change)).first()).toBeAttached();
  await other.close();

  await page.getByTestId("page-undo").click();
  await expect(page.getByTestId("toast-warning").filter({ hasText: H.stale })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("combobox", { name: cell(c.change, name) })).toHaveValue(choices[1]);
});
