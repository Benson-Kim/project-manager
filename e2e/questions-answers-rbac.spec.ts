import { expect, test } from "@playwright/test";
import { messages } from "../src/lib/messages";

/**
 * RBAC denial: Viewer is read-only on Q&A — mutation controls are
 * hidden/disabled AND the server enforces the permission (FORBIDDEN
 * unit-tested in src/modules/questions-answers/actions/actions.test.ts).
 * Runs with the e2e-viewer storage state (viewer.setup.ts — no new logins).
 */

test("viewer sees no New question affordance on the list", async ({ page }) => {
  await page.goto("/projects/2/questions-answers");
  await expect(
    page.getByRole("heading", { name: messages.questionsAnswers.title }),
  ).toBeVisible();
  await expect(page.getByTestId("new-question-answer")).toHaveCount(0);
});

test("viewer deep-linking ?id=new does not open the create sheet", async ({ page }) => {
  await page.goto("/projects/2/questions-answers?id=new");
  await expect(
    page.getByRole("heading", { name: messages.questionsAnswers.title }),
  ).toBeVisible();
  await expect(page.getByTestId("question-answer-form")).toHaveCount(0);
});

test("viewer sheet is read-only — no save or delete, fields disabled", async ({ page }) => {
  await page.goto("/projects/2/questions-answers?id=1");
  const form = page.getByTestId("question-answer-form");
  await expect(form).toBeVisible();
  await expect(page.getByTestId("qa-save")).toHaveCount(0);
  await expect(page.getByTestId("qa-delete")).toHaveCount(0);
  await expect(form.getByLabel(messages.questionsAnswers.question)).toBeDisabled();
});
