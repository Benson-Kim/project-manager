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
  await page.addInitScript(() => {
    let finish: ((ready: boolean) => void) | undefined;
    Object.defineProperty(window, "desktop", {
      value: { ensureDatabase: () => new Promise<boolean>((resolve) => { finish = resolve; }) },
    });
    Object.defineProperty(window, "finishDatabaseRecovery", { value: () => finish?.(true) });
  });
  let loginRequests = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/login") loginRequests++;
  });
  await page.goto("/login");
  await page.getByLabel(messages.auth.username).fill("e2e-pm");
  await page.getByLabel(messages.auth.password).fill(password);
  await page.getByRole("button", { name: messages.auth.signIn }).click();
  await expect(page.getByRole("button", { name: messages.auth.connecting })).toBeDisabled();
  expect(loginRequests).toBe(0);
  await page.evaluate(() => document.querySelector("form")!.requestSubmit());
  expect(loginRequests).toBe(0);
  await page.evaluate(() => {
    (window as Window & { finishDatabaseRecovery(): void }).finishDatabaseRecovery();
  });
  await page.waitForURL("/");
  expect(loginRequests).toBe(1);
  await expect(page.getByRole("heading", { name: messages.home.title })).toBeVisible();

  await page.getByRole("button", { name: messages.auth.signOut }).click();
  await page.waitForURL(/\/login/);
  await expect(page.getByRole("heading", { name: messages.auth.loginTitle })).toBeVisible();
});

test("failed desktop recovery keeps credentials and never submits an authentication request", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "desktop", { value: { ensureDatabase: async () => false } });
  });
  let loginRequests = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/login") loginRequests++;
  });
  await page.goto("/login");
  await page.getByLabel(messages.auth.username).fill("waiting-for-connection");
  await page.getByLabel(messages.auth.password).fill("keep-this-password");
  await page.getByRole("button", { name: messages.auth.signIn }).click();
  await expect(page.getByRole("alert").filter({ hasText: messages.auth.connectionFailed })).toBeVisible();
  await expect(page.getByLabel(messages.auth.username)).toHaveValue("waiting-for-connection");
  await expect(page.getByLabel(messages.auth.password)).toHaveValue("keep-this-password");
  await expect(page.getByRole("button", { name: messages.auth.signIn })).toBeEnabled();
  expect(loginRequests).toBe(0);
});

test("failed sign-in shows ONE generic message for wrong password and unknown user", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel(messages.auth.username).fill("e2e-pm");
  await page.getByLabel(messages.auth.password).fill("definitely-not-the-password");
  await page.getByRole("button", { name: messages.auth.signIn }).click();
  // Filtered: Next's empty route announcer also carries role=alert.
  await expect(
    page.getByRole("alert").filter({ hasText: messages.auth.loginFailed }),
  ).toBeVisible();

  await page.getByLabel(messages.auth.username).fill("no-such-user");
  await page.getByLabel(messages.auth.password).fill("definitely-not-the-password");
  await page.getByRole("button", { name: messages.auth.signIn }).click();
  // Byte-for-byte the same copy — no username enumeration surface.
  await expect(
    page.getByRole("alert").filter({ hasText: messages.auth.loginFailed }),
  ).toBeVisible();
});

test("expired session is announced on arrival at /login", async ({ page, context, baseURL }) => {
  await context.addCookies([
    { name: "authjs.session-token", value: "no-longer-decodable", url: baseURL! },
  ]);
  await page.goto("/");
  await page.waitForURL(/\/login\?reason=expired/);
  // Filtered: the app-shell live announcer also carries role=status.
  await expect(
    page.getByRole("status").filter({ hasText: messages.auth.sessionExpired }),
  ).toBeVisible();
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
