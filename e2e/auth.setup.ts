import { expect, test as setup } from "@playwright/test";
import { messages } from "../src/lib/messages";

/**
 * Signs in once as the seeded e2e project manager (db/seed/028, E2E_SEED=1)
 * and saves the storage state for the authenticated project. The password is
 * job-scoped (E2E_USER_PASSWORD) — never committed.
 */
setup("sign in as e2e-pm and persist storage state", async ({ page }) => {
  const password = process.env.E2E_USER_PASSWORD;
  if (!password) throw new Error("E2E_USER_PASSWORD must be set for the e2e suite");

  await page.goto("/login");
  await page.getByLabel(messages.auth.username).fill("e2e-pm");
  await page.getByLabel(messages.auth.password).fill(password);
  await page.getByRole("button", { name: messages.auth.signIn }).click();
  await page.waitForURL("/");
  await expect(page.getByRole("heading", { name: messages.app.name })).toBeVisible();
  await page.context().storageState({ path: "e2e/.auth/pm.json" });
});
