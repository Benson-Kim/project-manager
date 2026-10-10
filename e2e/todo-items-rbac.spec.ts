import { expect, test } from "@playwright/test";
import { messages } from "../src/lib/messages";

/**
 * Per-project access (ADR-0021): e2e-viewer holds Viewer on project 2, so
 * mutation controls are hidden AND the procs refuse writes (FORBIDDEN_ROW).
 * To-dos are personal: only their owner and project Managers can open them.
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

test("viewer cannot open another member's to-do — to-dos are personal", async ({ page }) => {
  await page.goto("/projects/2/todos?id=11");
  await expect(page.getByRole("heading", { name: messages.todoItems.title })).toBeVisible();
  await expect(page.getByTestId("todo-item-form")).toHaveCount(0);
});

test("viewer sees no reorder controls", async ({ page }) => {
  await page.goto("/projects/2/todos");
  await expect(page.getByRole("heading", { name: messages.todoItems.title })).toBeVisible();
  await expect(page.getByLabel(messages.todoItems.moveUp)).toHaveCount(0);
});
