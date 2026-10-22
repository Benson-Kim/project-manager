import { expect, test } from "@playwright/test";
import { messages } from "../src/lib/messages";

test("home page lists the module map", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: messages.app.name })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: messages.home.modules["todo-alerts"] }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: messages.home.modules.financials })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: messages.home.modules.requirements }),
  ).toBeVisible();
});

test("PWA manifest is served", async ({ request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.ok()).toBeTruthy();
  const manifest = await res.json();
  expect(manifest.name).toBe("Saeol Project Manager");
});
