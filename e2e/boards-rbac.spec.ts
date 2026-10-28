import { expect, test } from "@playwright/test";
import { messages } from "../src/lib/messages";

/**
 * RBAC denial: a Viewer on project 2 reads its boards and its register but gets no way to
 * create a board or import requirements. The procs refuse the writes anyway
 * (usp_Board_AssertAccess, proven by db/tests/boards-procs.cjs). Runs as e2e-viewer.
 */

const B = messages.boards;

test("viewer sees the project's boards but no New board", async ({ page }) => {
  await page.goto("/projects/2/boards");
  await expect(page.getByTestId("search-input")).toBeVisible();
  await expect(page.getByRole("button", { name: B.newBoard })).toHaveCount(0);
});

test("viewer gets no Add to board in the requirement register", async ({ page }) => {
  await page.goto("/projects/2/requirements?view=list");
  await expect(page.getByRole("heading", { name: messages.requirements.title })).toBeVisible();
  await expect(page.getByRole("button", { name: B.ui.packageTitle })).toHaveCount(0);
});
