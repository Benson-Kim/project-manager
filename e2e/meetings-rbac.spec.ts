import { expect, test } from "@playwright/test";
import { messages } from "../src/lib/messages";

/**
 * RBAC: a Viewer reads meetings and changes nothing. Buttons and cells are
 * hidden or disabled, and the procs refuse writes anyway (unit-tested in
 * src/modules/meetings/tests). A Contributor's "no delete" is covered by
 * src/modules/meetings/tests/access.test.ts: one more login would break the
 * e2e login budget (LESSONS §12). Runs as e2e-viewer, a Viewer on project 2.
 */

const M = messages.meetings;

test("viewer sees the list but no New meeting and no editable cells", async ({ page }) => {
  await page.goto("/projects/2/meetings?view=list");
  await expect(page.getByRole("heading", { name: M.title, level: 1 })).toBeVisible();
  await expect(page.getByText("Progress Achieved")).toBeVisible();
  await expect(page.getByTestId("new-meeting")).toHaveCount(0);
  await expect(page.getByTestId("datasheet-add-row")).toHaveCount(0);
  await expect(
    page.getByRole("textbox", {
      name: messages.datasheet.cellLabel(M.subject, "Progress Achieved"),
    }),
  ).toHaveCount(0);
});

test("viewer workspace is read-only: no save or delete, fields disabled", async ({ page }) => {
  await page.goto("/projects/2/meetings/1");
  const form = page.getByTestId("meeting-header-form");
  await expect(form).toBeVisible();
  await expect(page.getByTestId("meeting-save")).toHaveCount(0);
  await expect(page.getByTestId("meeting-delete")).toHaveCount(0);
  await expect(form.getByLabel(M.subject)).toBeDisabled();
  await expect(form.getByLabel(M.subject)).toHaveValue("Progress Achieved");
});
