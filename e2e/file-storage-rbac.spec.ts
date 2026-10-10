import { expect, test } from "@playwright/test";
import { messages } from "../src/lib/messages";

/**
 * RBAC denial for attachments (F1, ADR-0026): a Viewer on project 2 sees the
 * attachments read-only, and the server refuses an upload whatever the UI shows
 * (404, like any record the actor may not change). Runs with the e2e-viewer
 * storage state (viewer.setup.ts — no new logins).
 */

test("viewer sees attachments without add, rename or remove controls", async ({ page }) => {
  await page.goto("/projects/2/daily-activities?id=1");
  const section = page.getByTestId("attachments");
  await expect(section).toBeVisible();
  await expect(page.getByTestId("attachments-add-file")).toHaveCount(0);
  await expect(page.getByTestId("attachments-add-location")).toHaveCount(0);
  await expect(page.getByTestId("attachments-input")).toHaveCount(0);
  await expect(
    section.getByRole("button", { name: new RegExp(`^${messages.attachments.remove} `) }),
  ).toHaveCount(0);
  await expect(
    section.getByRole("button", { name: new RegExp(`^${messages.attachments.rename} `) }),
  ).toHaveCount(0);
});

test("viewer upload is refused by the server (404)", async ({ page, baseURL }) => {
  await page.goto("/");
  const res = await page.request.post("/api/files?owner=daily-activity&ownerId=1&name=x.pdf", {
    headers: { origin: baseURL!, "content-type": "application/octet-stream" },
    data: Buffer.from("%PDF-1.7\nviewer\n"),
  });
  expect(res.status()).toBe(404);
  expect((await res.json()).error.code).toBe("NOT_FOUND");
});

test("an unknown attachment answers 404", async ({ page }) => {
  await page.goto("/");
  const res = await page.request.get("/api/files/999999?owner=daily-activity");
  expect(res.status()).toBe(404);
});
