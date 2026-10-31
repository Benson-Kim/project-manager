import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { messages } from "../src/lib/messages";
import { caretAt } from "./support/editor";

/**
 * Notes (notebooks of titled pages). Runs as e2e-pm, a Manager on project 2 and
 * a plain User, so a Contributor in the project-less shared space at /notes.
 * Every test makes its own notebook, so parallel specs do not collide.
 */

async function axeClean(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations.filter((v) => ["serious", "critical"].includes(v.impact ?? ""));
}

function editor(page: Page) {
  return page.locator('[contenteditable="true"]').first();
}

async function newNotebook(page: Page, list = "/projects/2/notes") {
  await page.goto(list);
  await page.getByTestId("new-note").click();
  await page.waitForURL(new RegExp(`${list}/\\d+$`));
  await expect(page.getByTestId("note-title")).toBeVisible();
  await expect(editor(page)).toBeVisible({ timeout: 15_000 });
}

async function rename(page: Page, title: string) {
  await page.getByTestId("note-title").fill(title);
  await page.getByTestId("note-title-save").click();
  await expect(page.getByTestId("toast-success").first()).toBeVisible();
}

function tabs(page: Page) {
  return page.getByRole("tablist", { name: "Pages" }).getByTestId("note-tab");
}

function sections(page: Page) {
  return page.getByRole("tablist", { name: messages.notes.tabs }).getByTestId("note-section");
}

async function addPage(page: Page, expected: number) {
  await page.getByTestId("note-add-page").click();
  await expect(tabs(page)).toHaveCount(expected);
}

async function savePage(page: Page, title: string) {
  await page.getByTestId("note-page-title").fill(title);
  await page.getByTestId("note-page-save").click();
  await expect(tabs(page).filter({ hasText: title })).toHaveCount(1);
}

test("creates a notebook, renames it, builds pages, reorders and keeps everything on reload", async ({
  page,
}) => {
  const unique = `Notebook ${Date.now()}`;
  await newNotebook(page);
  await expect(tabs(page)).toHaveCount(1);

  await page.getByTestId("note-title").fill(unique);
  await page.getByTestId("note-title-save").click();
  await expect(page.getByTestId("toast-success").first()).toBeVisible();

  await addPage(page, 2);
  await addPage(page, 3);

  await tabs(page).nth(0).click();
  await savePage(page, "Alpha");

  await tabs(page).nth(1).click();
  await editor(page).click();
  await page.keyboard.type("Plain ");
  await page.keyboard.press("Control+B");
  await page.keyboard.type("strong");
  await page.keyboard.press("Control+B");
  await page
    .getByRole("toolbar", { name: "Formatting" })
    .getByRole("button", { name: "Table" })
    .click();
  await page.getByRole("menuitem", { name: "Insert table" }).click();
  await caretAt(editor(page), { inside: "tableHeader" });
  await page.keyboard.type("Cell one");
  await savePage(page, "Beta");

  await page.getByRole("tab", { name: "Alpha" }).click();
  await page.getByTestId("note-page-move-right").click();
  await expect(tabs(page).nth(0)).toContainText("Beta");
  await expect(tabs(page).nth(1)).toContainText("Alpha");

  await page.reload();
  await expect(page.getByTestId("note-title")).toHaveValue(unique);
  await expect(tabs(page)).toHaveCount(3);
  await expect(tabs(page).nth(0)).toContainText("Beta");
  await expect(tabs(page).nth(1)).toContainText("Alpha");

  await tabs(page).nth(0).click();
  await expect(page.getByTestId("note-page-title")).toHaveValue("Beta");
  await expect(editor(page)).toBeVisible({ timeout: 15_000 });
  await expect(editor(page).locator("strong")).toHaveText("strong");
  await expect(editor(page).locator("table th, table td").first()).toContainText("Cell one");
});

test("an empty notebook title shows an error and saves nothing", async ({ page }) => {
  await newNotebook(page);
  await page.getByTestId("note-title").fill("");
  await page.getByTestId("note-title-save").click();
  await expect(page.getByRole("alert").first()).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("note-title")).not.toHaveValue("");
});

test("deleting a page asks first and removes it", async ({ page }) => {
  await newNotebook(page);
  await addPage(page, 2);
  await tabs(page).nth(1).click();
  await savePage(page, "Drop me");

  await page.getByTestId("note-page-delete").click();
  const dialog = page.getByRole("dialog").filter({ hasText: "Drop me" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: messages.actions.delete }).click();
  await expect(dialog).toHaveCount(0);
  await expect(tabs(page)).toHaveCount(1);
  await expect(tabs(page).filter({ hasText: "Drop me" })).toHaveCount(0);

  await page.reload();
  await expect(tabs(page)).toHaveCount(1);
});

test("adding a page with unsaved edits asks before discarding them", async ({ page }) => {
  await newNotebook(page);
  await editor(page).click();
  await page.keyboard.type("Keep me");

  await page.getByTestId("note-add-page").click();
  const dialog = page.getByRole("dialog").filter({ hasText: messages.notes.discardTitle });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: messages.actions.cancel }).click();
  await expect(dialog).toHaveCount(0);
  await expect(tabs(page)).toHaveCount(1);
  await expect(editor(page)).toContainText("Keep me");

  await page.getByTestId("note-add-page").click();
  await dialog.getByRole("button", { name: messages.feedback.discard }).click();
  await expect(tabs(page)).toHaveCount(2);
});

test("leaving through the side menu with unsaved edits asks first", async ({ page }) => {
  await newNotebook(page);
  const here = page.url();
  await editor(page).click();
  await page.keyboard.type("Keep me");

  const dashboard = page.getByTestId("nav-primary").getByRole("link", { name: "Dashboard" });
  await dashboard.click();
  const dialog = page.getByRole("dialog").filter({ hasText: messages.notes.discardTitle });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: messages.actions.cancel }).click();
  await expect(page).toHaveURL(here);
  await expect(editor(page)).toContainText("Keep me");

  await dashboard.click();
  await dialog.getByRole("button", { name: messages.feedback.discard }).click();
  await expect(page).not.toHaveURL(here);
});

test("a notebook without a project lives at /notes, keeps its pages, and only an Admin deletes it", async ({
  page,
}) => {
  const unique = `Shared ${Date.now()}`;
  await newNotebook(page, "/notes");
  await rename(page, unique);
  await editor(page).click();
  await page.keyboard.type("Everyone can edit this");
  await savePage(page, "Shared page");

  await page.reload();
  await expect(page.getByTestId("note-title")).toHaveValue(unique);
  await expect(editor(page)).toBeVisible({ timeout: 15_000 });
  await expect(editor(page)).toContainText("Everyone can edit this");
  await expect(page.getByTestId("note-add-page")).toBeVisible();
  await expect(page.getByTestId("note-delete")).toHaveCount(0);
  await expect(page.getByTestId("note-page-delete")).toHaveCount(0);

  await page.getByTestId("notes-back").click();
  await page.waitForURL(/\/notes$/);
  await page.getByTestId("filter-project").selectOption("none");
  await page.waitForURL(/project=none/);
  await page.getByTestId("notes-search").fill(unique);
  await page.waitForURL(/q=/);
  const row = page.getByRole("row").filter({ hasText: unique });
  await expect(row).toContainText(messages.projectPicker.none);
});

test("/notes lists a project's notebook with its project and opens it under the project", async ({
  page,
}) => {
  const unique = `Project book ${Date.now()}`;
  await newNotebook(page);
  await rename(page, unique);
  const projectUrl = page.url();

  await page.goto(`/notes?q=${encodeURIComponent(unique)}`);
  const link = page.getByRole("link", { name: unique });
  await expect(link).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: unique })).not.toContainText(
    messages.projectPicker.none,
  );
  await link.click();
  await page.waitForURL(projectUrl);

  await page.goto(projectUrl.replace(/\/projects\/\d+\/notes\//, "/notes/"));
  await page.waitForURL(projectUrl);
});

test("groups pages into tabs, moves a page between them, renames, reorders and removes the tabs", async ({
  page,
}) => {
  await newNotebook(page);
  await rename(page, `Tabbed ${Date.now()}`);
  await savePage(page, "One");
  await addPage(page, 2);
  await tabs(page).nth(1).click();
  await savePage(page, "Two");
  await expect(sections(page)).toHaveCount(0);

  await page.getByTestId("note-add-tab").click();
  await expect(sections(page)).toHaveText([messages.notes.newTabTitle(1)]);
  await expect(tabs(page)).toHaveText(["One", "Two"]);

  await page.getByTestId("note-add-tab").click();
  await expect(sections(page)).toHaveCount(2);
  await expect(sections(page).nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(tabs(page)).toHaveText([messages.notes.firstPageTitle]);
  await expect(page.getByTestId("note-page-title")).toHaveValue(messages.notes.firstPageTitle);
  await expect(page.getByTestId("note-page-delete")).toBeDisabled();
  await savePage(page, "Three");

  await sections(page).nth(0).click();
  await page.getByRole("tab", { name: "Two" }).click();
  await page
    .getByTestId("note-page-move-to-tab")
    .selectOption({ label: messages.notes.newTabTitle(2) });
  await expect(sections(page).nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(tabs(page)).toHaveText(["Three", "Two"]);
  await expect(page.getByRole("tab", { name: "Two" })).toHaveAttribute("aria-selected", "true");

  await sections(page).nth(0).click();
  await expect(tabs(page)).toHaveText(["One"]);
  await expect(page.getByTestId("note-page-move-to-tab")).toBeDisabled();
  await expect(page.getByTestId("note-page-delete")).toBeDisabled();

  await sections(page).nth(1).click();
  await page.getByTestId("note-tab-rename").click();
  const renaming = page.getByRole("dialog").filter({ hasText: messages.notes.renameTab });
  await renaming.getByTestId("note-tab-title").fill("Ideas");
  await renaming.getByTestId("note-tab-save").click();
  await expect(renaming).toHaveCount(0);
  await expect(sections(page).nth(1)).toHaveText("Ideas");

  await page.getByTestId("note-section-move-left").click();
  await expect(sections(page)).toHaveText(["Ideas", messages.notes.newTabTitle(1)]);

  await page.getByTestId("note-add-tab").click();
  await expect(sections(page)).toHaveCount(3);
  await page.getByTestId("note-tab-delete").click();
  const deleting = page.getByRole("dialog").filter({ hasText: messages.notes.deleteTab });
  await deleting.getByRole("button", { name: messages.actions.delete }).click();
  await expect(deleting).toHaveCount(0);
  await expect(sections(page)).toHaveText(["Ideas", messages.notes.newTabTitle(1)]);

  await page.reload();
  await expect(sections(page)).toHaveText(["Ideas", messages.notes.newTabTitle(1)]);
  await expect(tabs(page)).toHaveText(["Three", "Two"]);
  await expect(editor(page)).toBeVisible({ timeout: 15_000 });
  expect(await axeClean(page)).toEqual([]);

  await page.getByTestId("note-tabs-remove").click();
  const removing = page.getByRole("dialog").filter({ hasText: messages.notes.removeTabsConfirm });
  await removing.getByRole("button", { name: messages.notes.removeTabs }).click();
  await expect(removing).toHaveCount(0);
  await expect(sections(page)).toHaveCount(0);
  await expect(tabs(page)).toHaveText(["Three", "Two", "One"]);

  await page.reload();
  await expect(sections(page)).toHaveCount(0);
  await expect(tabs(page)).toHaveText(["Three", "Two", "One"]);
});

test("prints a notebook with each tab and its pages, and leads back to it", async ({ page }) => {
  const unique = `Printed ${Date.now()}`;
  await newNotebook(page);
  await rename(page, unique);
  await editor(page).click();
  await page.keyboard.type("First page text");
  await savePage(page, "Opening");
  await page.getByTestId("note-add-tab").click();
  await expect(sections(page)).toHaveCount(1);
  await page.getByTestId("note-add-tab").click();
  await expect(sections(page)).toHaveCount(2);
  await expect(page.getByTestId("note-page-title")).toHaveValue(messages.notes.firstPageTitle);
  await expect(editor(page)).toBeVisible({ timeout: 15_000 });
  await editor(page).click();
  await page.keyboard.type("Second tab text");
  await savePage(page, "Follow-up");
  const notebook = page.url();

  await page.getByTestId("note-print-link").click();
  await page.waitForURL(`${notebook}/print`);
  const printed = page.getByTestId("printed-note");
  await expect(printed.getByRole("heading", { level: 1 })).toHaveText(unique);
  await expect(printed.getByTestId("print-note-tab")).toHaveCount(2);
  await expect(printed.getByRole("heading", { level: 2 })).toHaveText([
    messages.notes.newTabTitle(1),
    messages.notes.newTabTitle(2),
  ]);
  await expect(printed.getByTestId("print-note-page")).toHaveText([
    /Opening\s*First page text/,
    /Follow-up\s*Second tab text/,
  ]);
  await expect(page.getByTestId("note-print")).toBeVisible();
  await expect(page).toHaveTitle(new RegExp(unique));
  expect(await axeClean(page)).toEqual([]);

  await page.getByTestId("note-print-back").click();
  await page.waitForURL(notebook);
});

test("prints a notebook without tabs as one list of pages", async ({ page }) => {
  const unique = `Plain print ${Date.now()}`;
  await newNotebook(page, "/notes");
  await rename(page, unique);
  await savePage(page, "Only page");
  await page.goto(`${page.url()}/print`);
  const printed = page.getByTestId("printed-note");
  await expect(printed.getByRole("heading", { level: 1 })).toHaveText(unique);
  await expect(printed.getByRole("heading", { level: 2 })).toHaveText(["Only page"]);
  await expect(printed.getByTestId("print-note-page")).toHaveCount(1);
});

test("keeps the editor toolbar in view, under the header, while a long page scrolls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  await newNotebook(page);
  await editor(page).click();
  for (let line = 0; line < 40; line++) await page.keyboard.press("Enter");
  await page.keyboard.type("Last line");
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));

  const header = (await page.getByRole("banner").boundingBox())!;
  const toolbar = page.getByRole("toolbar", { name: "Formatting" });
  const bar = (await toolbar.boundingBox())!;
  expect((await editor(page).boundingBox())!.y).toBeLessThan(0);
  expect(Math.abs(bar.y - (header.y + header.height))).toBeLessThanOrEqual(1);
  await toolbar.getByRole("button", { name: "Bold" }).click();
  await page.keyboard.type(" bold");
  await expect(editor(page).locator("strong")).toHaveText("bold");
});

test("axe: the shared notes list has no serious or critical violations", async ({ page }) => {
  await page.goto("/notes");
  await expect(page.getByTestId("new-note")).toBeVisible();
  expect(await axeClean(page)).toEqual([]);
});

test("axe: the notes list has no serious or critical violations", async ({ page }) => {
  await page.goto("/projects/2/notes");
  await expect(page.getByTestId("new-note")).toBeVisible();
  expect(await axeClean(page)).toEqual([]);
});

test("axe: the notebook workspace has no serious or critical violations", async ({ page }) => {
  await newNotebook(page);
  expect(await axeClean(page)).toEqual([]);
});
