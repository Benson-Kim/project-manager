import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { messages } from "../src/lib/messages";
import { attendanceSummary } from "../src/modules/meetings/schemas/meeting-display";
import { escapeRegExp, expectListed, expectNotListed } from "./support/datasheet";

/**
 * Meetings (module #10, M2 and M3): the section, the datasheet list with its
 * rich-text cell, the meeting workspace header (full route, ADR-0010) and its
 * participant panel. Runs as e2e-pm, a Manager on project 2. Seeded meeting 1
 * ("Progress Achieved") is on project 2 with Gary Cantrall and Stakeholder
 * Firstname attending and Test2Firstname's apology; meeting 2 is on project 24,
 * which e2e-pm is not on. Other specs add stakeholders to project 2 in
 * parallel, so the participant tests find people by name and change only the
 * meetings they create.
 */

const M = messages.meetings;

async function expectToast(page: Page, title: string) {
  await expect(page.getByTestId("toast-success").filter({ hasText: title }).first()).toBeVisible();
}

/** "New meeting" makes a draft and opens its workspace. */
async function newMeeting(page: Page) {
  await page.goto("/projects/2/meetings");
  await page.getByTestId("new-meeting").click();
  await page.waitForURL(/\/projects\/2\/meetings\/\d+$/);
  const form = page.getByTestId("meeting-header-form");
  await expect(form).toBeVisible();
  // The editor surface exists only on the client: once it shows, the form is hydrated.
  await expect(form.getByRole("textbox", { name: M.objective, exact: true })).toBeVisible({
    timeout: 15_000,
  });
  return form;
}

/** Types into a rich-text field (the lazy editor surface) with one bold word. */
async function writeRich(page: Page, name: string, plain: string, bold: string) {
  const editor = page.getByRole("textbox", { name, exact: true });
  await expect(editor).toBeVisible({ timeout: 15_000 });
  await editor.click();
  await page.keyboard.type(`${plain} `);
  await page.keyboard.press("Control+B");
  await page.keyboard.type(bold);
  await page.keyboard.press("Control+B");
}

/** A person's radio group in the participant panel, found by the start of their label. */
function participant(page: Page, name: string) {
  return page
    .getByTestId("participants-panel")
    .getByRole("group", { name: new RegExp(`^${escapeRegExp(name)}`) });
}

function attendance(page: Page, name: string, value: keyof typeof M.attendance) {
  return participant(page, name).getByRole("radio", { name: M.attendance[value], exact: true });
}

const counts = (attended: number, apologies: number) =>
  `${M.attendedCount(attended)} · ${M.apologyCount(apologies)}`;

async function axeClean(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations.filter((v) => ["serious", "critical"].includes(v.impact ?? ""));
}

test("the section sits in the project nav and lists the seeded meeting", async ({ page }) => {
  await page.goto("/projects/2");
  const sections = page.getByRole("navigation", { name: messages.projects.sectionsNav });
  await sections.getByRole("button", { name: messages.activity.title }).click();
  // The group's panel is portalled to <body>, outside the nav.
  await page
    .getByRole("group", { name: messages.activity.title })
    .getByRole("link", { name: messages.projects.meetingsSection })
    .click();
  await expect(page).toHaveURL(/\/projects\/2\/meetings$/);
  await expect(page.getByRole("heading", { name: M.title, level: 1 })).toBeVisible();
  await expectListed(page, "Progress Achieved");
});

test("create, edit the header, find it in the list, then delete it", async ({ page }) => {
  const title = `E2E meeting ${Date.now()}`;
  const form = await newMeeting(page);
  await form.getByLabel(M.subject).fill(title);
  await writeRich(page, M.objective, "Review the", "budget");
  await form.getByLabel(M.startDate).fill("2026-10-20");
  await form.getByLabel(M.startTime).fill("09:00");
  await form.getByLabel(M.endTime).fill("10:30");
  await form.getByLabel(M.location).fill("Board room");
  await page.getByTestId("meeting-save").click();
  await expectToast(page, messages.feedback.saved);
  await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();

  await page.goto(`/projects/2/meetings?q=${encodeURIComponent(title)}`);
  await expectListed(page, title);
  const table = page.getByTestId("data-view-table");
  await expect(table.getByText("09:00–10:30")).toBeVisible();
  await expect(
    table.getByRole("button", { name: messages.datasheet.cellLabel(M.objective, title) }),
  ).toBeVisible();

  await page.getByRole("button", { name: messages.datasheet.open(title) }).click();
  await page.waitForURL(/\/projects\/2\/meetings\/\d+$/);
  await page.getByTestId("meeting-delete").click();
  await page.getByRole("button", { name: messages.actions.delete }).last().click();
  await expectToast(page, messages.feedback.deleted);
  await page.waitForURL(/\/projects\/2\/meetings$/);
  await page.goto(`/projects/2/meetings?q=${encodeURIComponent(title)}`);
  await expectNotListed(page, title);
});

test("validation: a title is required and the end must come after the start", async ({ page }) => {
  const form = await newMeeting(page);
  await form.getByLabel(M.startTime).fill("10:00");
  await form.getByLabel(M.endTime).fill("09:30");
  // Blur first: the message that blur shows moves Save down between mousedown and mouseup,
  // so a click that blurs the field as it lands misses the button.
  await form.getByLabel(M.endTime).blur();
  await expect(form.getByText(M.endAfterStart)).toBeVisible();
  await page.getByTestId("meeting-save").click();
  await expect(form.getByText(M.titleRequired)).toBeVisible();
  const summary = page.getByRole("alert").filter({ hasText: messages.errors.summaryTitle });
  await expect(summary).toBeVisible();
});

test("a rich-text cell edits in its panel and survives an edit of another cell", async ({
  page,
}) => {
  const title = `E2E rich cell ${Date.now()}`;
  const form = await newMeeting(page);
  await form.getByLabel(M.subject).fill(title);
  await writeRich(page, M.objective, "Agree the", "scope");
  await page.getByTestId("meeting-save").click();
  await expectToast(page, messages.feedback.saved);

  const listUrl = `/projects/2/meetings?view=list&q=${encodeURIComponent(title)}`;
  await page.goto(listUrl);
  const objective = page.getByRole("button", {
    name: messages.datasheet.cellLabel(M.objective, title),
  });
  await expect(objective.locator("strong")).toHaveText("scope");

  // Another cell's save rebuilds the form from the list row: the rich field must stay whole.
  const location = page.getByRole("textbox", {
    name: messages.datasheet.cellLabel(M.location, title),
  });
  await location.fill("Room 7");
  await location.press("Enter");
  await expect(page.getByText(messages.datasheet.saved(M.location))).toBeAttached();
  await page.goto(listUrl);
  await expect(location).toHaveValue("Room 7");
  await expect(objective.locator("strong")).toHaveText("scope");

  // The panel: type more, save, and the formatted text keeps its bold word.
  await objective.click();
  const panel = page.getByTestId("rich-cell-panel");
  const editor = panel.getByRole("textbox", { name: messages.datasheet.editCell(M.objective) });
  await expect(editor).toBeFocused({ timeout: 15_000 });
  await page.keyboard.press("Control+End");
  await page.keyboard.type(" today");
  await panel.getByTestId("rich-cell-save").click();
  await expect(panel).toHaveCount(0);
  await page.goto(listUrl);
  await expect(objective).toHaveAccessibleDescription(/Agree the scope today/);
  await expect(objective.locator("strong")).toContainText("scope");

  // Esc cancels; Shift+F2 opens the larger editor.
  await objective.focus();
  await page.keyboard.press("Shift+F2");
  const zoom = page.getByRole("dialog", { name: messages.datasheet.editCell(M.objective) });
  await expect(zoom.getByTestId("rich-cell-zoom")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(zoom).toHaveCount(0);
  await expect(objective).toBeFocused();
});

test("a meeting of another project is not found under this one", async ({ page }) => {
  await page.goto("/projects/2/meetings/2");
  await expect(page.getByRole("heading", { name: messages.app.notFoundTitle })).toBeVisible();
  await expect(page.getByTestId("meeting-header-form")).toHaveCount(0);
});

test("axe: the meetings list has no serious or critical violations", async ({ page }) => {
  await page.goto("/projects/2/meetings?view=list");
  await expect(page.getByRole("heading", { name: M.title, level: 1 })).toBeVisible();
  expect(await axeClean(page)).toEqual([]);
});

test("axe: the meeting workspace has no serious or critical violations", async ({ page }) => {
  await page.goto("/projects/2/meetings/1");
  await expect(page.getByRole("heading", { name: "Progress Achieved", level: 1 })).toBeVisible();
  await expect(page.getByRole("textbox", { name: M.description, exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await expect(attendance(page, "Gary Cantrall", "attended")).toBeChecked();
  expect(await axeClean(page)).toEqual([]);
});

test("the workspace links back to the list", async ({ page }) => {
  await page.goto("/projects/2/meetings/1");
  const trail = page.getByRole("navigation", { name: messages.nav.breadcrumb });
  await expect(trail.getByText("Progress Achieved")).toHaveAttribute("aria-current", "page");
  await trail.getByRole("link", { name: M.title }).click();
  await expect(page).toHaveURL(new RegExp(`${escapeRegExp("/projects/2/meetings")}$`));
});

test("participants: the seeded meeting shows who attended and who sent apologies", async ({
  page,
}) => {
  await page.goto("/projects/2/meetings/1");
  const panel = page.getByTestId("participants-panel");
  await expect(panel.getByRole("heading", { name: M.participants, level: 2 })).toBeVisible();
  await expect(panel.getByTestId("participant-counts")).toHaveText(counts(2, 1));
  await expect(attendance(page, "Gary Cantrall", "attended")).toBeChecked();
  await expect(attendance(page, "Stakeholder Firstname", "attended")).toBeChecked();
  await expect(attendance(page, "Test2Firstname", "apology")).toBeChecked();
  await expect(participant(page, "Gary Cantrall")).toHaveAccessibleName(
    /^Gary Cantrall - Software Engineer, Organization and efficiency/,
  );
});

test("participants: mark attended and apology, save, reload keeps them, the list counts them", async ({
  page,
}) => {
  const title = `E2E participants ${Date.now()}`;
  await newMeeting(page);
  const panel = page.getByTestId("participants-panel");
  await expect(panel.getByTestId("participant-counts")).toHaveText(counts(0, 0));
  await expect(attendance(page, "Gary Cantrall", "none")).toBeChecked();
  await expect(page.getByTestId("participants-save")).toBeDisabled();

  await attendance(page, "Gary Cantrall", "attended").check();
  await attendance(page, "Test2Firstname", "apology").check();
  await expect(panel.getByTestId("participant-counts")).toHaveText(counts(1, 1));
  // The search narrows the list and keeps the choices made.
  await panel.getByLabel(M.searchParticipants).fill("test2");
  await expect(participant(page, "Gary Cantrall")).toHaveCount(0);
  await expect(attendance(page, "Test2Firstname", "apology")).toBeChecked();
  await panel.getByLabel(M.searchParticipants).fill("");
  await expect(attendance(page, "Gary Cantrall", "attended")).toBeChecked();

  // New meeting shows no toast, so this one is the panel's.
  await page.getByTestId("participants-save").click();
  await expectToast(page, messages.feedback.saved);
  await page.reload();
  await expect(attendance(page, "Gary Cantrall", "attended")).toBeChecked();
  await expect(attendance(page, "Test2Firstname", "apology")).toBeChecked();
  await expect(attendance(page, "Stakeholder Firstname", "none")).toBeChecked();
  await expect(panel.getByTestId("participant-counts")).toHaveText(counts(1, 1));

  // A title to find the meeting by in the list.
  const form = page.getByTestId("meeting-header-form");
  await expect(form.getByRole("textbox", { name: M.objective, exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await form.getByLabel(M.subject).fill(title);
  await page.getByTestId("meeting-save").click();
  await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();

  await page.goto(`/projects/2/meetings?view=list&q=${encodeURIComponent(title)}`);
  await expectListed(page, title);
  await expect(
    page.getByTestId("data-view-table").getByText(attendanceSummary(1, 1)),
  ).toBeVisible();
});

test("participants: with both forms unsaved, leaving asks once", async ({ page }) => {
  const form = await newMeeting(page);
  const url = page.url();
  await attendance(page, "Gary Cantrall", "apology").check();
  await form.getByLabel(M.subject).fill("Unsaved title");

  const trail = page.getByRole("navigation", { name: messages.nav.breadcrumb });
  await trail.getByRole("link", { name: M.title }).click();
  const dialog = page.getByRole("dialog", { name: messages.feedback.unsavedChangesTitle });
  await expect(dialog).toHaveCount(1);
  await dialog.getByRole("button", { name: messages.actions.cancel }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(url);
  await expect(attendance(page, "Gary Cantrall", "apology")).toBeChecked();
  await expect(form.getByLabel(M.subject)).toHaveValue("Unsaved title");

  // The header's Cancel asks too, then Discard leaves without asking again.
  await form.getByRole("button", { name: messages.actions.cancel }).click();
  await expect(dialog).toHaveCount(1);
  await dialog.getByRole("button", { name: messages.feedback.discard }).click();
  await page.waitForURL(/\/projects\/2\/meetings$/);
  await expect(dialog).toHaveCount(0);
});

test("participants: the browser's Back asks before leaving unsaved choices", async ({ page }) => {
  await newMeeting(page);
  const url = page.url();
  await attendance(page, "Gary Cantrall", "apology").check();

  // The App Router handles popstate itself; the guard puts the entry back and asks.
  await page.goBack({ waitUntil: "commit" });
  const dialog = page.getByRole("dialog", { name: messages.feedback.unsavedChangesTitle });
  await expect(dialog).toHaveCount(1);
  await dialog.getByRole("button", { name: messages.actions.cancel }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(url);
  await expect(attendance(page, "Gary Cantrall", "apology")).toBeChecked();

  await page.goBack({ waitUntil: "commit" });
  await expect(dialog).toHaveCount(1);
  await dialog.getByRole("button", { name: messages.feedback.discard }).click();
  await page.waitForURL(/\/projects\/2\/meetings$/);
  await expect(dialog).toHaveCount(0);
});

test("participants: a save from a stale panel conflicts and reloads", async ({ page }) => {
  await newMeeting(page);
  const other = await page.context().newPage();
  await other.goto(page.url());
  // The editor surface exists only on the client: once it shows, the page is hydrated.
  await expect(other.getByRole("textbox", { name: M.objective, exact: true })).toBeVisible({
    timeout: 15_000,
  });

  await attendance(page, "Gary Cantrall", "attended").check();
  await page.getByTestId("participants-save").click();
  await expectToast(page, messages.feedback.saved);

  await attendance(other, "Gary Cantrall", "apology").check();
  await other.getByTestId("participants-save").click();
  const panel = other.getByTestId("participants-panel");
  await expect(panel.getByRole("alert")).toContainText(messages.errors.CONFLICT);
  await panel.getByRole("button", { name: M.reload }).click();
  await expect(attendance(other, "Gary Cantrall", "attended")).toBeChecked();
  await expect(panel.getByRole("alert")).toHaveCount(0);
  await expect(other.getByTestId("participants-save")).toBeDisabled();
  await other.close();
});
