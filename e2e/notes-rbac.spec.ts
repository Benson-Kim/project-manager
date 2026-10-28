import { expect, test } from "@playwright/test";

/**
 * RBAC: a Viewer reads notebooks and changes nothing. Buttons and editors are
 * hidden or read-only, and the procs refuse writes anyway (note-sql-guardrails
 * and the notes unit tests). A Contributor's "no delete" is a Manager-level
 * proc rule covered by the guardrails: one more login would break the e2e
 * login budget. Runs as e2e-viewer, a Viewer on project 2. In the project-less
 * shared space every user writes but only an Admin deletes (proven against the
 * database by db/tests/notes-procs.cjs).
 */

test("viewer sees the list but no New notebook", async ({ page }) => {
  await page.goto("/projects/2/notes");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByTestId("new-note")).toHaveCount(0);
});

test("viewer writes in the project-less shared space but cannot delete", async ({ page }) => {
  const unique = `Viewer shared ${Date.now()}`;
  await page.goto("/notes");
  await page.getByTestId("new-note").click();
  await page.waitForURL(/\/notes\/\d+$/);
  await expect(page.locator('[contenteditable="true"]').first()).toBeVisible({ timeout: 15_000 });

  await page.getByTestId("note-title").fill(unique);
  await page.getByTestId("note-title-save").click();
  await expect(page.getByTestId("toast-success").first()).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("note-title")).toHaveValue(unique);
  await expect(page.getByTestId("note-page-save")).toBeVisible();
  await expect(page.getByTestId("note-delete")).toHaveCount(0);
  await expect(page.getByTestId("note-page-delete")).toHaveCount(0);
});

test("viewer gets no New notebook on /notes filtered to their read-only project", async ({
  page,
}) => {
  await page.goto("/notes?project=2");
  await expect(page.getByRole("heading", { level: 1 })).toBeAttached();
  await expect(page.getByTestId("filter-project")).toHaveValue("2");
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
