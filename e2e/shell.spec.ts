import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { messages } from "@/lib/messages";

/**
 * App shell (issue #28): sidebar order, header actions (bell, theme toggle,
 * avatar menu), mobile drawer, axe. Runs as e2e-pm (storage state — no extra
 * logins; the logout test only asserts the redirect and stops).
 */

test("sidebar renders the specified items in order with Settings and Logout pinned", async ({
  page,
}) => {
  await page.goto("/");
  const primary = page.getByTestId("nav-primary");
  await expect(primary.getByRole("link")).toHaveText([
    "Dashboard",
    "Projects",
    "Daily activities",
    "To-do lists",
    "Reports",
  ]);
  const bottom = page.getByTestId("nav-bottom");
  await expect(bottom.getByRole("link", { name: "Settings" })).toBeVisible();
  await expect(bottom.getByRole("button", { name: "Sign out" })).toBeVisible();
  // New project is visible for ProjectManager (projects:create).
  await expect(page.getByTestId("shell-new-project")).toBeVisible();
});

test("/todo renders the To-do lists page with the module heading", async ({ page }) => {
  await page.goto("/todo");
  await expect(
    page.getByRole("heading", { name: messages.todoItems.title, level: 1 }),
  ).toBeVisible();
});

test("theme toggle flips html[data-theme] and persists across reload", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByTestId("theme-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByTestId("theme-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("notifications bell is filled with a dot for the seeded overdue to-dos and lists them", async ({
  page,
}) => {
  await page.goto("/");
  const bell = page.getByTestId("notifications-bell");
  // db/seed/028 gives e2e-pm an overdue to-do with an alert; the bell lists the user's own
  // alerts only (migrated to-dos belong to the admin, db/seed/029_migrated_todo_owner.sql).
  await expect(bell).toHaveAttribute("data-state", "filled");
  await expect(page.getByTestId("notifications-dot")).toBeVisible();
  await bell.click();
  await expect(
    page
      .getByRole("list", { name: messages.app.notifications })
      .getByText("E2E overdue alert", { exact: false }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(bell).toBeFocused();
});

test("avatar menu opens with keyboard support and signs out", async ({ page }) => {
  await page.goto("/");
  const trigger = page.getByTestId("avatar-menu");
  await expect(trigger).toHaveText("EP"); // e2e-pm
  await trigger.click();
  await expect(page.getByRole("menuitem", { name: "Change password" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Settings" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await page.waitForURL(/\/login/);
  // Stop here — no re-login (login budget, LESSONS §12).
});

test("selection checkbox has a meaningful accessible name (issue #25)", async ({ page }) => {
  await page.goto("/kitchen-sink");
  await page.getByTestId("view-list").click();
  await expect(page.getByRole("checkbox").first()).toHaveAccessibleName(/^Select /);
});

test("mobile drawer opens from the hamburger and closes with Escape", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 720 });
  await page.goto("/");
  await page.getByTestId("open-drawer").click();
  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("link", { name: "Dashboard" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(page.getByTestId("open-drawer")).toBeFocused();
});

test("axe scan on the shell (dashboard) has no serious or critical violations in both themes", async ({
  page,
}) => {
  await page.goto("/");
  const light = await new AxeBuilder({ page }).analyze();
  expect(light.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual(
    [],
  );
  await page.getByTestId("theme-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const dark = await new AxeBuilder({ page }).analyze();
  expect(dark.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual(
    [],
  );
});
