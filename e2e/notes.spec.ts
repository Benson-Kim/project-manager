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
