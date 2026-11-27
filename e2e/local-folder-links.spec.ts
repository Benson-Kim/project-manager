import { expect, test, type Page } from "@playwright/test";
import { messages } from "../src/lib/messages";

/**
 * Links to folders on the user's PC. The web build cannot open a folder, so a
 * click shows the path to copy. Runs as e2e-pm, a Manager on project 2.
 */

const R = messages.richText;
const FOLDER = String.raw`C:\Users\Public\CIUSS Pilot 2025`;

function editor(page: Page) {
  return page.locator('[contenteditable="true"]').first();
}

async function newNotebookWithText(page: Page, text: string) {
  await page.goto("/projects/2/notes");
  await page.getByTestId("new-note").click();
  await page.waitForURL(/\/projects\/2\/notes\/\d+$/);
  await expect(editor(page)).toBeVisible({ timeout: 15_000 });
  await editor(page).click();
  await page.keyboard.type(text);
  await page.keyboard.press("Control+A");
}

async function linkSelection(page: Page, address: string) {
  await page
    .getByRole("toolbar", { name: "Formatting" })
    .getByRole("button", { name: R.link })
    .click();
  const dialog = page.getByRole("dialog", { name: R.link });
  await dialog.getByLabel(R.linkAddress).fill(address);
  await dialog.getByRole("button", { name: R.applyLink }).click();
  return dialog;
}

async function showInReadOnlyText(page: Page, folder: string) {
  await page.evaluate((path) => {
    const anchor = document.createElement("a");
    anchor.dataset.localPath = path;
    anchor.textContent = "Pilot files";
    anchor.id = "read-only-folder-link";
    document.querySelector("main")?.prepend(anchor);
  }, folder);
  await page.locator("#read-only-folder-link").click();
}

test("a folder typed in the link dialog is saved as a folder link and kept on reload", async ({
  page,
}) => {
  await newNotebookWithText(page, "Pilot files");
  const dialog = await linkSelection(page, FOLDER);
  await expect(dialog).toHaveCount(0);

  const link = editor(page).locator("a[data-local-path]");
  await expect(link).toHaveAttribute("data-local-path", FOLDER);
  await expect(link).not.toHaveAttribute("href", /.*/);

  await page.keyboard.press("Control+S");
  await expect(page.getByTestId("toast-success").first()).toBeVisible({ timeout: 15_000 });
  await page.reload();
  await expect(editor(page).locator("a[data-local-path]")).toHaveAttribute(
    "data-local-path",
    FOLDER,
  );
});

test("a program cannot be linked: the dialog says to link the folder instead", async ({ page }) => {
  await newNotebookWithText(page, "Setup");
  const dialog = await linkSelection(page, String.raw`C:\Tools\setup.exe`);
  await expect(dialog).toContainText(R.localPathBlocked);
  await expect(editor(page).locator("a[data-local-path]")).toHaveCount(0);
});

test("in the web build a folder link shows its path to copy instead of opening", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/projects/2/notes");
  await showInReadOnlyText(page, FOLDER);

  const dialog = page.getByRole("dialog", { name: R.localPathTitle });
  await expect(dialog.getByTestId("local-path-value")).toHaveText(FOLDER);
  await dialog.getByRole("button", { name: R.localPathCopy }).click();
  await expect(page.getByText(R.localPathCopied)).toBeVisible();
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(FOLDER);
});

test("a folder link to a program is refused when clicked", async ({ page }) => {
  await page.goto("/projects/2/notes");
  await showInReadOnlyText(page, String.raw`C:\Tools\setup.exe`);
  await expect(page.getByText(R.localPathRefused)).toBeVisible();
  await expect(page.getByRole("dialog", { name: R.localPathTitle })).toHaveCount(0);
});
