import { expect, test } from "@playwright/test";

/**
 * RBAC: a Viewer reads notebooks and changes nothing. Buttons and editors are
 * hidden or read-only, and the procs refuse writes anyway (note-sql-guardrails
 * and the notes unit tests). A Contributor's "no delete" is a Manager-level
 * proc rule covered by the guardrails: one more login would break the e2e
 * login budget. Runs as e2e-viewer, a Viewer on project 2.
 */

test("viewer sees the list but no New notebook", async ({ page }) => {
  await page.goto("/projects/2/notes");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByTestId("new-note")).toHaveCount(0);
});

test("viewer reads a notebook but has no editor, save or delete controls", async ({ page }) => {
  await page.goto("/projects/2/notes");
  const first = page.locator('a[href^="/projects/2/notes/"]').first();
  await expect(first).toBeVisible();
  await first.click();
  await page.waitForURL(/\/projects\/2\/notes\/\d+$/);

  await expect(page.getByRole("tablist", { name: "Pages" })).toBeVisible();
  await expect(page.locator('[contenteditable="true"]')).toHaveCount(0);
  for (const id of [
    "note-title-save",
    "note-add-page",
    "note-page-save",
    "note-page-delete",
    "note-page-move-left",
    "note-page-move-right",
    "note-delete",
  ]) {
    await expect(page.getByTestId(id), id).toHaveCount(0);
  }
});
