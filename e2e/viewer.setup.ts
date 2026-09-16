import { test as setup } from "@playwright/test";
import { messages } from "../src/lib/messages";

/**
 * Signs in once as the seeded read-only viewer (db/seed/028, E2E_SEED=1) for
 * the RBAC denial specs. One extra real login per run — budgeted against the
 * 5/min/IP window (LESSONS §12): setup 1 + viewer 1 + auth.spec 3 = 5.
 */
setup("sign in as e2e-viewer and persist storage state", async ({ page }) => {
  const password = process.env.E2E_USER_PASSWORD;
  if (!password) throw new Error("E2E_USER_PASSWORD must be set for the e2e suite");

  await page.goto("/login");
  await page.getByLabel(messages.auth.username).fill("e2e-viewer");
  await page.getByLabel(messages.auth.password).fill(password);
  await page.getByRole("button", { name: messages.auth.signIn }).click();
  await page.waitForURL("/");
  await page.context().storageState({ path: "e2e/.auth/viewer.json" });
});
