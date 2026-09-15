import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { messages } from "../src/lib/messages";

/**
 * Module #4 auth flows (issue #4). Runs without the shared storage state —
 * every test starts signed out. Sequential in one worker: authorize() rate
 * limits login attempts per IP (5/min) and all tests share the runner's IP.
 */
test.describe.configure({ mode: "default" });

const password = process.env.E2E_USER_PASSWORD ?? "";

test("happy path: sign in, land on the app, sign out", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel(messages.auth.username).fill("e2e-pm");
  await page.getByLabel(messages.auth.password).fill(password);
  await page.getByRole("button", { name: messages.auth.signIn }).click();
  await page.waitForURL("/");
  await expect(page.getByRole("heading", { name: messages.app.name })).toBeVisible();

  await page.getByRole("button", { name: messages.auth.signOut }).click();
  await page.waitForURL(/\/login/);
  await expect(page.getByRole("heading", { name: messages.auth.loginTitle })).toBeVisible();
});

test("failed sign-in shows ONE generic message for wrong password and unknown user", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel(messages.auth.username).fill("e2e-pm");
  await page.getByLabel(messages.auth.password).fill("definitely-not-the-password");
  await page.getByRole("button", { name: messages.auth.signIn }).click();
  await expect(page.getByRole("alert")).toContainText(messages.auth.loginFailed);

  await page.getByLabel(messages.auth.username).fill("no-such-user");
  await page.getByLabel(messages.auth.password).fill("definitely-not-the-password");
  await page.getByRole("button", { name: messages.auth.signIn }).click();
  // Byte-for-byte the same copy — no username enumeration surface.
  await expect(page.getByRole("alert")).toContainText(messages.auth.loginFailed);
});

test("expired session is announced on arrival at /login", async ({ page, context, baseURL }) => {
  await context.addCookies([
    { name: "authjs.session-token", value: "no-longer-decodable", url: baseURL! },
  ]);
  await page.goto("/");
  await page.waitForURL(/\/login\?reason=expired/);
  await expect(page.getByRole("status")).toContainText(messages.auth.sessionExpired);
});

test("unauthenticated requests are gated to /login", async ({ page }) => {
  await page.goto("/kitchen-sink");
  await page.waitForURL(/\/login/);
  await expect(page.getByRole("heading", { name: messages.auth.loginTitle })).toBeVisible();
});

test("axe scan on /login has no serious or critical violations", async ({ page }) => {
  await page.goto("/login");
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter((v) => v.impact === "serious" || v.impact === "critical"),
  ).toEqual([]);
});
