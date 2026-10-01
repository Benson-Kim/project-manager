import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "line" : "html",
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    // Signs in as the seeded e2e-pm user and saves the storage state.
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    // One viewer login for the RBAC denial specs (after setup — spreads the
    // shared-IP login budget, LESSONS §12).
    { name: "viewer-setup", testMatch: /viewer\.setup\.ts/, dependencies: ["setup"] },
    // Auth flows + header checks start signed out (no storage state).
    { name: "public", testMatch: /(auth|security-headers)\.spec\.ts/ },
    // Everything else runs authenticated (module #4 gates all app routes).
    {
      name: "app",
      testMatch:
        /(home|kitchen-sink|projects|key-deliverables|shell|stakeholders|suppliers|daily-activities|todo-items|questions-answers|parking-lot|assumptions-constraints)\.spec\.ts/,
      dependencies: ["setup"],
      use: { storageState: "e2e/.auth/pm.json" },
    },
    {
      name: "app-viewer",
      testMatch:
        /(projects-rbac|key-deliverables-rbac|stakeholders-rbac|suppliers-rbac|daily-activities-rbac|todo-items-rbac|questions-answers-rbac|parking-lot-rbac|assumptions-constraints-rbac)\.spec\.ts/,
      dependencies: ["viewer-setup"],
      use: { storageState: "e2e/.auth/viewer.json" },
    },
  ],
  webServer: {
    command: "npm run build && npm run start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    // E2E=1 keeps the /kitchen-sink gallery reachable in the production build
    // used for tests (it 404s in real production).
    env: { E2E: "1" },
  },
});
