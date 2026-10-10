import { expect, test } from "@playwright/test";
import { messages } from "../src/lib/messages";

/**
 * Per-project access (ADR-0021): e2e-viewer is a global User with Viewer
 * access on project 2 only (db/seed/029_e2e_project_assignee.sql). Mutation
 * controls are hidden for that level AND the procs enforce it (FORBIDDEN_ROW,
 * verified in the shadow-schema harness and the actions' unit tests).
 * Runs with the e2e-viewer storage state (viewer.setup.ts).
 */

test("any user can start a project — New project is offered and the form opens", async ({
  page,
}) => {
  await page.goto("/projects");
  await expect(page.getByRole("heading", { name: messages.projects.title })).toBeVisible();
  // The sidebar offers New project to everyone (the list adds via its new-entry row).
  await expect(page.getByTestId("shell-new-project")).toBeVisible();
  await page.goto("/projects/new");
  await expect(page.getByRole("heading", { name: messages.projects.newProject })).toBeVisible();
});

test("the list shows only projects the viewer is on", async ({ page }) => {
  await page.goto("/projects");
  await expect(page.getByText("Upgrade Inventory Management").first()).toBeVisible();
  await expect(page.getByText("Platform migraation")).toHaveCount(0);
});

// Every section of a project the viewer is not on renders the not-found page, never an
// error or an empty section that would confirm the project exists (S1, ADR-0021). The
// (app) loading boundary streams first, so assert the page, not the HTTP status.
const SECTIONS = [
  "",
  "/daily-activities",
  "/deliverables",
  "/deliverables/gantt",
  "/keywords",
  "/objectives",
  "/questions-answers",
  "/stakeholders",
  "/suppliers",
  "/todos",
  "/parking-lot",
  "/assumptions-constraints",
];
for (const section of SECTIONS) {
  test(`/projects/1${section} is not found for a viewer who is not on project 1`, async ({
    page,
  }) => {
    await page.goto(`/projects/1${section}`);
    await expect(page.getByRole("heading", { name: messages.app.notFoundTitle })).toBeVisible();
  });
}

test("viewer charter is read-only — no save or delete, fields disabled", async ({ page }) => {
  await page.goto("/projects/2");
  await expect(page.getByTestId("project-form")).toBeVisible();
  await expect(page.getByTestId("project-save")).toHaveCount(0);
  await expect(page.getByTestId("project-delete")).toHaveCount(0);
  await expect(page.getByLabel(messages.projects.name)).toBeDisabled();
});

test("viewer sees the team but cannot change it", async ({ page }) => {
  await page.goto("/projects/2");
  await expect(page.getByTestId("assignee-list")).toContainText("E2E Viewer");
  // Viewers see the team but get no new-member row, no inline controls, no cog (ADR-0024).
  await expect(page.getByTestId("team-add-row")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Permissions for / })).toHaveCount(0);
});
