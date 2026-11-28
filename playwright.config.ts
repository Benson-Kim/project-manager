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
        /(home|search|cross-links|kitchen-sink|projects|bpmn|checklists|checklist-board|cross-window|key-deliverables|shell|stakeholders|stakeholder-matrix|stakeholder-picker|responsibility-matrix|suppliers|daily-activities|todo-items|todo-planner|questions-answers|parking-lot|assumptions-constraints|datasheet|rich-text|file-storage|financials|financial-documents|project-math|meetings|meeting-minutes|requirements|requirements-canvas|risks-issues|notes|boards|decisions|settings|admin-users|page-undo|whiteboard|list-print|custom-columns|local-folder-links)\.spec\.ts/,
      dependencies: ["setup", "viewer-setup"],
      use: { storageState: "e2e/.auth/pm.json" },
    },
    {
      name: "app-viewer",
      testMatch:
        /(projects-rbac|key-deliverables-rbac|stakeholders-rbac|suppliers-rbac|daily-activities-rbac|todo-items-rbac|questions-answers-rbac|parking-lot-rbac|assumptions-constraints-rbac|datasheet-rbac|file-storage-rbac|financials-rbac|meetings-rbac|requirements-rbac|risks-issues-rbac|notes-rbac|boards-rbac)\.spec\.ts/,
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
    //
    // The whole suite drives one signed-in user at machine speed, so it sits on top of
    // the per-user action limit (240 a minute, src/lib/rate-limit.ts) and saves start
    // coming back refused. The limit guards real people, not a harness, so the harness
    // raises its own ceiling; the shipped default and its unit tests are untouched.
    env: { E2E: "1", RATE_LIMIT_ACTIONS_PER_MINUTE: "20000" },
  },
});
