import { expect, test } from "@playwright/test";
import { messages } from "../src/lib/messages";

/**
 * Datasheet access (ADR-0023): cells are editable only where the row's
 * ActorAccess allows the update, and the new-entry row only where the viewer
 * may create. Runs as e2e-viewer, Viewer on project 2.
 */
test("a Viewer sees the deliverables datasheet read-only, without a new-entry row", async ({
  page,
}) => {
  await page.goto("/projects/2/deliverables?view=list");
  await expect(page.getByTestId("data-view-table")).toBeVisible();
  await expect(page.getByTestId("datasheet-add-row")).toHaveCount(0);
  await expect(
    page.getByTestId("data-view-table").getByRole("textbox", {
      name: new RegExp(`^${messages.keyDeliverables.requirement}, `),
    }),
  ).toHaveCount(0);
});

test("a Viewer cannot edit or add daily activities of the project", async ({ page }) => {
  await page.goto("/projects/2/daily-activities?view=list");
  await expect(page.getByRole("heading", { name: messages.dailyActivities.title })).toBeVisible();
  await expect(page.getByTestId("datasheet-add-row")).toHaveCount(0);
  await expect(
    page.getByRole("textbox", { name: new RegExp(`^${messages.dailyActivities.columns.task}, `) }),
  ).toHaveCount(0);
});
