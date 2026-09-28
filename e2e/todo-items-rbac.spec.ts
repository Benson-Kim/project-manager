import { expect, test } from "@playwright/test";
import { messages } from "../src/lib/messages";

/**
 * RBAC denial: Viewer is read-only on to-do items — mutation controls are
 * hidden AND the server enforces the permission (FORBIDDEN unit-tested in
 * src/modules/todo-items/actions/actions.test.ts).
 * Runs with the e2e-viewer storage state (viewer.setup.ts — no new logins).
 */

test("viewer sees no New to-do affordance on the project list", async ({ page }) => {
  await page.goto("/projects/2/todos");
  await expect(page.getByRole("heading", { name: messages.todoItems.title })).toBeVisible();
  await expect(page.getByTestId("new-todo-item")).toHaveCount(0);
});

test("viewer deep-linking ?id=new does not open the create sheet", async ({ page }) => {
  await page.goto("/projects/2/todos?id=new");
  await expect(page.getByRole("heading", { name: messages.todoItems.title })).toBeVisible();
  await expect(page.getByTestId("todo-item-form")).toHaveCount(0);
});

test("viewer sheet is read-only — no save or delete, fields disabled", async ({ page }) => {
  await page.goto("/projects/2/todos?id=11");
  const form = page.getByTestId("todo-item-form");
  await expect(form).toBeVisible();
  await expect(page.getByTestId("todo-item-save")).toHaveCount(0);
  await expect(page.getByTestId("todo-item-delete")).toHaveCount(0);
  await expect(form.getByLabel(messages.todoItems.todoItem)).toBeDisabled();
});

test("viewer sees no reorder controls", async ({ page }) => {
  await page.goto("/projects/2/todos");
  await expect(page.getByRole("heading", { name: messages.todoItems.title })).toBeVisible();
  await expect(page.getByLabel(messages.todoItems.moveUp)).toHaveCount(0);
});
