import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { messages } from "../src/lib/messages";
import { closeAlarmToast } from "./support/alarms";

/**
 * File attachments (F1, ADR-0026) on the daily-activity sheet. Runs as e2e-pm
 * (Manager on project 2) against seeded activity 1. Tests run in parallel on
 * the same activity, so every file has a unique name and is found by it.
 */
const SHEET = "/projects/2/daily-activities?id=1";
const pdf = (text: string) => Buffer.from(`%PDF-1.7\n${text}\n%%EOF\n`);
const unique = (base: string) => `e2e-${Date.now()}-${Math.round(Math.random() * 1e6)}-${base}`;

async function openSheet(page: Page) {
  await page.goto(SHEET);
  await expect(page.getByTestId("daily-activity-form")).toBeVisible();
  await closeAlarmToast(page);
  const section = page.getByTestId("attachments");
  await expect(section).toBeVisible();
  return section;
}

async function attach(page: Page, name: string, buffer: Buffer, mimeType = "application/pdf") {
  await page.getByTestId("attachments-input").setInputFiles({ name, mimeType, buffer });
}

const successToast = (page: Page, text: string) =>
  page.getByTestId("toast-success").filter({ hasText: text }).first();
const errorToast = (page: Page, text: string) =>
  page.getByTestId("toast-error").filter({ hasText: text }).first();

test("upload → list → download (same bytes) → rename → remove", async ({ page }) => {
  const section = await openSheet(page);
  const name = unique("plan.pdf");
  const bytes = pdf(name);

  await attach(page, name, bytes);
  await expect(successToast(page, messages.attachments.uploaded(name))).toBeVisible({
    timeout: 15_000,
  });
  const link = section.getByRole("link", { name: messages.attachments.download(name) });
  await expect(link).toBeVisible();

  const [download] = await Promise.all([page.waitForEvent("download"), link.click()]);
  expect(download.suggestedFilename()).toBe(name);
  expect(await readFile((await download.path())!)).toEqual(bytes);

  // Rename: the dialog has no <form>, so saving it never submits the activity.
  const renamed = unique("renamed");
  await section.getByRole("button", { name: `${messages.attachments.rename} ${name}` }).click();
  const input = page.getByTestId("attachment-rename-input");
  await input.fill(renamed);
  await input.press("Enter");
  await expect(successToast(page, messages.attachments.renamed)).toBeVisible({ timeout: 15_000 });
  const renamedLink = section.getByRole("link", {
    name: messages.attachments.download(`${renamed}.pdf`),
  });
  await expect(renamedLink).toBeVisible();
  await expect(page.getByTestId("daily-activity-form")).toBeVisible();
  await expect(successToast(page, messages.feedback.saved)).toHaveCount(0);

  await section
    .getByRole("button", { name: `${messages.attachments.remove} ${renamed}.pdf` })
    .click();
  const dialog = page.getByRole("dialog", {
    name: messages.attachments.removeTitle(`${renamed}.pdf`),
  });
  await dialog.getByRole("button", { name: messages.attachments.remove }).click();
  await expect(successToast(page, messages.attachments.removed)).toBeVisible({ timeout: 15_000 });
  await expect(renamedLink).toHaveCount(0);
});

test("a file larger than the proxy's 10 MB streams through", async ({ page }) => {
  const section = await openSheet(page);
  const name = unique("large.pdf");
  const big = Buffer.alloc(12 * 1024 * 1024, 0x20);
  big.write("%PDF-1.7\n");
  await attach(page, name, big);
  await expect(successToast(page, messages.attachments.uploaded(name))).toBeVisible({
    timeout: 60_000,
  });
  await expect(
    section.getByRole("link", { name: messages.attachments.download(name) }),
  ).toBeVisible();
});

test("a type the browser lets through but the bytes betray is refused", async ({ page }) => {
  const section = await openSheet(page);
  const name = unique("spoofed.pdf");
  await attach(page, name, Buffer.from("<!doctype html><script>alert(1)</script>"), "text/html");
  await expect(
    errorToast(
      page,
      messages.attachments.errors.failedWith(name, messages.attachments.errors.typeNotAllowed),
    ),
  ).toBeVisible({ timeout: 15_000 });
  await expect(section.getByText(name)).toHaveCount(0);
});

test("the picker refuses other types and files over 25 MB before uploading", async ({ page }) => {
  await openSheet(page);
  let posted = false;
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/api/files")) posted = true;
  });

  await attach(page, "setup.exe", Buffer.from("MZ"), "application/octet-stream");
  await expect(
    errorToast(
      page,
      messages.attachments.errors.failedWith(
        "setup.exe",
        messages.attachments.errors.typeNotAllowed,
      ),
    ),
  ).toBeVisible({ timeout: 15_000 });

  await attach(page, "huge.pdf", Buffer.alloc(25 * 1024 * 1024 + 1, 0x20));
  await expect(
    errorToast(
      page,
      messages.attachments.errors.failedWith("huge.pdf", messages.attachments.errors.tooLarge),
    ),
  ).toBeVisible({ timeout: 15_000 });
  expect(posted).toBe(false);
});

test("the server refuses a body over 25 MB (413)", async ({ page, baseURL }) => {
  await page.goto("/");
  const res = await page.request.post(
    `/api/files?owner=daily-activity&ownerId=1&name=${encodeURIComponent(unique("big.pdf"))}`,
    {
      headers: { origin: baseURL!, "content-type": "application/octet-stream" },
      data: Buffer.alloc(26 * 1024 * 1024, 0x20),
    },
  );
  expect(res.status()).toBe(413);
  expect((await res.json()).error.message).toBe(messages.attachments.errors.tooLarge);
});

test("a cross-site upload is refused (403)", async ({ page }) => {
  await page.goto("/");
  const res = await page.request.post("/api/files?owner=daily-activity&ownerId=1&name=x.pdf", {
    headers: { origin: "https://evil.example", "content-type": "application/octet-stream" },
    data: pdf("x"),
  });
  expect(res.status()).toBe(403);
});

test("a location reference: text with Copy, a web address as a link", async ({ page }) => {
  const section = await openSheet(page);

  const shareName = unique("contract");
  await page.getByTestId("attachments-add-location").click();
  await page.getByTestId("attachment-location-name").fill(shareName);
  await page.getByTestId("attachment-location-value").fill("\\\\fs01\\projects\\contract.pdf");
  await page.getByTestId("attachment-dialog-save").click();
  await expect(successToast(page, messages.attachments.locationAdded)).toBeVisible({
    timeout: 15_000,
  });
  const shareRow = section.getByTestId("attachment").filter({ hasText: shareName });
  await expect(shareRow.getByTestId("attachment-location")).toHaveText(
    "\\\\fs01\\projects\\contract.pdf",
  );
  await expect(shareRow.getByRole("button", { name: /^Copy/ })).toBeVisible();

  const webName = unique("sharepoint");
  await page.getByTestId("attachments-add-location").click();
  await page.getByTestId("attachment-location-name").fill(webName);
  const url = "https://contoso.sharepoint.com/sites/pm/Shared%20Documents/plan.docx";
  await page.getByTestId("attachment-location-value").fill(url);
  await page.getByTestId("attachment-location-value").press("Enter");
  const webRow = section.getByTestId("attachment").filter({ hasText: webName });
  await expect(webRow.getByRole("link", { name: url })).toHaveAttribute(
    "rel",
    "noopener noreferrer",
  );
});

test("an empty location is refused inline", async ({ page }) => {
  await openSheet(page);
  await page.getByTestId("attachments-add-location").click();
  await page.getByTestId("attachment-location-name").fill("Somewhere");
  await page.getByTestId("attachment-dialog-save").click();
  await expect(page.getByText(messages.attachments.errors.locationRequired)).toBeVisible();
});

test("a new activity has no attachments section until it is saved", async ({ page }) => {
  await page.goto("/projects/2/daily-activities?id=new");
  await expect(page.getByTestId("daily-activity-form")).toBeVisible();
  await expect(page.getByTestId("attachments")).toHaveCount(0);
});

for (const scheme of ["light", "dark"] as const) {
  test(`axe: the sheet with attachments has no serious or critical violations (${scheme})`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await openSheet(page);
    const name = unique("axe.pdf");
    await attach(page, name, pdf(name));
    await expect(
      page
        .getByTestId("attachments")
        .getByRole("link", { name: messages.attachments.download(name) }),
    ).toBeVisible();
    const results = await new AxeBuilder({ page }).include("[data-testid=attachments]").analyze();
    const serious = results.violations.filter((v) =>
      ["serious", "critical"].includes(v.impact ?? ""),
    );
    expect(serious).toEqual([]);
  });
}
