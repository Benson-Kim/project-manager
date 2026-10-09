import { expect, test } from "@playwright/test";

test("home page lists the module map", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Project Manager" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "To-Do & Alerts" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Financials" })).toBeVisible();
});

test("PWA manifest is served", async ({ request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.ok()).toBeTruthy();
  const manifest = await res.json();
  expect(manifest.name).toBe("Saeol Project Manager");
});
