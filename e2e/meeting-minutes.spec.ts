import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { messages } from "../src/lib/messages";

/**
 * Meeting minutes (module #10, M4): the agenda → discussion points → actions
 * tree in the meeting workspace, its open and overdue actions, and the
 * printed minutes. Runs as e2e-pm, a Manager on project 2. Each test builds
 * its own minutes on a meeting it creates; meeting 2 is on project 24, which
 * e2e-pm is not on.
 */

const M = messages.meetings;

/** "New meeting" makes a draft and opens its workspace. */
async function newMeeting(page: Page) {
  await page.goto("/projects/2/meetings");
  await page.getByTestId("new-meeting").click();
  await page.waitForURL(/\/projects\/2\/meetings\/\d+$/);
  const header = page.getByTestId("meeting-header-form");
  // The editor surface exists only on the client: once it shows, the page is hydrated.
  await expect(header.getByRole("textbox", { name: M.objective, exact: true })).toBeVisible({
    timeout: 15_000,
  });
  return page.getByTestId("minutes");
}

async function addAgendaItem(page: Page, text: string) {
  await page.getByRole("button", { name: M.addAgendaItem, exact: true }).click();
  const form = page.getByRole("form", { name: M.addAgendaItem });
  await form.getByLabel(M.agendaItem, { exact: true }).fill(text);
  await form.getByRole("button", { name: messages.actions.save }).click();
  await expect(form).toHaveCount(0);
  await expect(page.getByTestId("agenda-item").filter({ hasText: text })).toBeVisible();
}

async function addDiscussionPoint(page: Page, agendaItem: string, text: string) {
  await page.getByRole("button", { name: M.addDiscussionPointTo(agendaItem) }).click();
  const form = page.getByRole("form", { name: M.addDiscussionPoint });
  const editor = form.getByRole("textbox", { name: M.discussionPoint, exact: true });
  await expect(editor).toBeVisible({ timeout: 15_000 });
  await editor.click();
  await page.keyboard.type(text);
  await form.getByRole("button", { name: messages.actions.save }).click();
  await expect(form).toHaveCount(0);
  await expect(page.getByTestId("discussion-point").filter({ hasText: text })).toBeVisible();
}

async function addAction(
  page: Page,
  parent: string,
  action: { text: string; person?: RegExp; due?: string; status?: string },
) {
  await page.getByRole("button", { name: M.addActionTo(parent) }).click();
  const form = page.getByRole("form", { name: M.addAction });
  await form.getByLabel(M.action, { exact: true }).fill(action.text);
  if (action.person) {
    await form.getByRole("combobox", { name: M.personResponsible }).fill("Gary");
    await page.getByRole("option", { name: action.person }).first().click();
  }
  if (action.due) await form.getByLabel(M.dueDate, { exact: true }).fill(action.due);
  if (action.status) {
    await form.getByLabel(M.status, { exact: true }).selectOption({ label: action.status });
  }
  await form.getByRole("button", { name: messages.actions.save }).click();
  await expect(form).toHaveCount(0);
  await expect(page.getByTestId("action-item").filter({ hasText: action.text })).toBeVisible();
}

/** One follow-up under an action (ADR-0043). */
async function addFollowUp(
  page: Page,
  action: string,
  followUp: { text: string; person?: RegExp; on?: string; due?: string },
) {
  await page.getByRole("button", { name: M.addFollowUpTo(action) }).click();
  const form = page.getByRole("form", { name: M.addFollowUp });
  await form.getByLabel(M.followUp, { exact: true }).fill(followUp.text);
  if (followUp.person) {
    await form.getByRole("combobox", { name: M.assignedTo }).fill("Gary");
    await page.getByRole("option", { name: followUp.person }).first().click();
  }
  if (followUp.on) await form.getByLabel(M.followUpDate, { exact: true }).fill(followUp.on);
  if (followUp.due) await form.getByLabel(M.dueDate, { exact: true }).fill(followUp.due);
  await form.getByRole("button", { name: messages.actions.save }).click();
  await expect(form).toHaveCount(0);
  await expect(page.getByTestId("follow-up").filter({ hasText: followUp.text })).toBeVisible();
}

async function axeClean(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations.filter((v) => ["serious", "critical"].includes(v.impact ?? ""));
}

const GARY = /^Gary Cantrall/;

test("minutes: a typed assignee survives blur, saving and an unrelated edit", async ({ page }) => {
  await newMeeting(page);
  await addAgendaItem(page, "External review");
  await page.getByRole("button", { name: M.addActionTo("External review") }).click();
  const form = page.getByRole("form", { name: M.addAction });
  await form.getByLabel(M.action, { exact: true }).fill("Ask the external reviewer");
  const person = form.getByRole("combobox", { name: M.personResponsible });
  await person.fill("External reviewer");
  await person.press("Tab");
  await expect(person).toHaveAttribute("aria-expanded", "false");
  await expect(form.locator('input[name="assigneeOther"]')).toHaveValue("External reviewer");
  await form.getByRole("button", { name: messages.actions.save }).click();
  await expect(form).toHaveCount(0);

  const item = page.getByTestId("action-item").filter({ hasText: "Ask the external reviewer" });
  await expect(item).toContainText("External reviewer");
  await page.reload();
  await page.getByRole("button", { name: M.editItem("Ask the external reviewer") }).click();
  const edit = page.getByRole("form", { name: M.editItem(M.actionEntity) });
  const storedPerson = edit.getByRole("combobox", { name: M.personResponsible });
  await expect(storedPerson).toHaveValue("External reviewer");
  await storedPerson.focus();
  await storedPerson.press("Tab");
  await expect(storedPerson).toHaveAttribute("aria-expanded", "false");
  await edit.getByLabel(M.action, { exact: true }).fill("Ask the external reviewer again");
  await edit.getByRole("button", { name: messages.actions.save }).click();
  await expect(edit).toHaveCount(0);
  await page.reload();
  await expect(item).toContainText("External reviewer");
});

test("minutes: build the agenda, discussion points and actions, then reorder from the keyboard", async ({
  page,
}) => {
  const minutes = await newMeeting(page);
  await expect(minutes.getByText(M.noAgenda)).toBeVisible();
  await expect(minutes.getByTestId("open-actions")).toContainText(M.noOpenActions);

  await addAgendaItem(page, "Budget");
  await addAgendaItem(page, "Risks");
  await addDiscussionPoint(page, "Budget", "Over by five percent");
  await addAction(page, "Over by five percent", {
    text: "Send the revised budget",
    person: GARY,
    due: "2020-01-15",
  });
  await addAction(page, "Risks", { text: "Update the risk log", due: "2099-12-31" });

  const budgetAction = page.getByTestId("action-item").filter({ hasText: "Send the revised" });
  await expect(budgetAction).toContainText("Gary Cantrall");
  await expect(budgetAction).toContainText(M.overdue);

  // Open actions: earliest due first, the overdue one marked.
  const open = minutes.getByTestId("open-action");
  await expect(open).toHaveCount(2);
  await expect(open.first()).toContainText("Send the revised budget");
  await expect(open.first()).toContainText(M.overdue);
  await expect(open.nth(1)).not.toContainText(M.overdue);
  await expect(minutes.getByTestId("overdue-count")).toHaveText(M.overdueCount(1));

  // Reorder with the keyboard: focus stays on the moved item's buttons.
  const agenda = minutes.getByRole("heading", { level: 4 });
  await expect(agenda).toHaveText(["1. Budget", "2. Risks"]);
  await page.getByRole("button", { name: M.moveUp("Risks") }).focus();
  await page.keyboard.press("Enter");
  await expect(agenda).toHaveText(["1. Risks", "2. Budget"]);
  const moveDown = page.getByRole("button", { name: M.moveDown("Risks") });
  await expect(moveDown).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(agenda).toHaveText(["1. Budget", "2. Risks"]);
  await expect(page.getByRole("button", { name: M.moveUp("Risks") })).toBeFocused();
  await page.getByRole("button", { name: M.moveUp("Risks") }).press("Enter");
  await expect(agenda).toHaveText(["1. Risks", "2. Budget"]);

  // Everything was saved: a reload shows the same tree.
  await page.reload();
  await expect(agenda).toHaveText(["1. Risks", "2. Budget"]);
  await expect(page.getByTestId("discussion-point")).toHaveText(/2\.1\s*Over by five percent/);
  await expect(budgetAction).toContainText("Gary Cantrall");

  // Edit inline: rename an agenda item, then clear an action's due date.
  await page.getByRole("button", { name: M.editItem("Budget") }).click();
  const edit = page.getByRole("form", { name: M.editItem(M.agendaEntity) });
  await edit.getByLabel(M.agendaItem, { exact: true }).fill("Budget and costs");
  await edit.getByRole("button", { name: messages.actions.save }).click();
  await expect(agenda).toHaveText(["1. Risks", "2. Budget and costs"]);
  await expect(page.getByRole("button", { name: M.editItem("Budget and costs") })).toBeFocused();

  await page.getByRole("button", { name: M.editItem("Send the revised budget") }).click();
  const editAction = page.getByRole("form", { name: M.editItem(M.actionEntity) });
  await expect(editAction.getByRole("combobox", { name: M.personResponsible })).toHaveValue(GARY);
  await editAction.getByLabel(M.dueDate, { exact: true }).fill("");
  await editAction.getByRole("button", { name: messages.actions.save }).click();
  await expect(editAction).toHaveCount(0);
  await expect(minutes.getByTestId("overdue-count")).toHaveCount(0);
  await expect(budgetAction).toContainText("Gary Cantrall");

  expect(await axeClean(page)).toEqual([]);
});

test("minutes: a required text is asked for", async ({ page }) => {
  await newMeeting(page);
  await page.getByRole("button", { name: M.addAgendaItem, exact: true }).click();
  const form = page.getByRole("form", { name: M.addAgendaItem });
  await form.getByRole("button", { name: messages.actions.save }).click();
  await expect(form.getByText(M.agendaItemRequired)).toBeVisible();
  await expect(form.getByRole("alert")).toContainText(messages.errors.VALIDATION);
  await form.getByRole("button", { name: messages.actions.cancel }).click();
  await expect(form).toHaveCount(0);
  await expect(page.getByRole("button", { name: M.addAgendaItem, exact: true })).toBeFocused();
});

test("minutes: a save that refreshes the page keeps another form's unsaved changes", async ({
  page,
}) => {
  await newMeeting(page);
  const header = page.getByTestId("meeting-header-form");
  await header.getByLabel(M.subject).fill("Unsaved title");
  await addAgendaItem(page, "Budget");
  // A discussion point's save refreshes the page for its formatted view.
  await addDiscussionPoint(page, "Budget", "Formatted on the server");
  await expect(page.getByTestId("discussion-point").locator(".rich-text")).toBeVisible();
  const dialog = page.getByRole("dialog", { name: messages.feedback.unsavedChangesTitle });
  await expect(dialog).toHaveCount(0);
  await expect(header.getByLabel(M.subject)).toHaveValue("Unsaved title");

  // Leaving still asks.
  const trail = page.getByRole("navigation", { name: messages.nav.breadcrumb });
  await trail.getByRole("link", { name: M.title }).click();
  await expect(dialog).toHaveCount(1);
  await dialog.getByRole("button", { name: messages.actions.cancel }).click();
  await expect(header.getByLabel(M.subject)).toHaveValue("Unsaved title");
});

test("minutes: deleting an agenda item takes its discussion points and actions", async ({
  page,
}) => {
  const minutes = await newMeeting(page);
  await addAgendaItem(page, "Keep me");
  await addAgendaItem(page, "Drop me");
  await addDiscussionPoint(page, "Drop me", "Going away");
  await addAction(page, "Going away", { text: "Never done" });
  await addAction(page, "Keep me", { text: "Still open" });
  await expect(minutes.getByTestId("open-action")).toHaveCount(2);

  await page.getByRole("button", { name: M.deleteItem("Drop me") }).click();
  const dialog = page.getByRole("dialog", {
    name: messages.confirmDelete.title(M.agendaEntity, "Drop me"),
  });
  await expect(dialog).toContainText(M.deleteAgendaBody);
  await dialog.getByRole("button", { name: messages.actions.delete }).click();
  await expect(dialog).toHaveCount(0);

  await expect(minutes.getByTestId("agenda-item")).toHaveCount(1);
  await expect(minutes.getByTestId("discussion-point")).toHaveCount(0);
  await expect(minutes.getByTestId("open-action")).toHaveText([/Still open/]);
  await page.reload();
  await expect(minutes.getByTestId("agenda-item")).toHaveText([/Keep me/]);
  await expect(minutes.getByText("Never done")).toHaveCount(0);
});

test("minutes: an edit from a stale page conflicts and reloads", async ({ page }) => {
  await newMeeting(page);
  await addAgendaItem(page, "Original");
  const other = await page.context().newPage();
  await other.goto(page.url());
  await expect(other.getByRole("textbox", { name: M.objective, exact: true })).toBeVisible({
    timeout: 15_000,
  });

  await page.getByRole("button", { name: M.editItem("Original") }).click();
  const mine = page.getByRole("form", { name: M.editItem(M.agendaEntity) });
  await mine.getByLabel(M.agendaItem, { exact: true }).fill("Mine");
  await mine.getByRole("button", { name: messages.actions.save }).click();
  await expect(mine).toHaveCount(0);

  await other.getByRole("button", { name: M.editItem("Original") }).click();
  const theirs = other.getByRole("form", { name: M.editItem(M.agendaEntity) });
  await theirs.getByLabel(M.agendaItem, { exact: true }).fill("Theirs");
  await theirs.getByRole("button", { name: messages.actions.save }).click();
  await expect(theirs.getByRole("alert")).toContainText(messages.errors.CONFLICT);
  await theirs.getByRole("button", { name: M.reload }).click();
  await expect(theirs).toHaveCount(0);
  await expect(other.getByTestId("agenda-item")).toHaveText([/Mine/]);
  await other.close();
});

test("print: the printed minutes show the header, the people and the minutes", async ({ page }) => {
  const title = `E2E minutes ${Date.now()}`;
  await newMeeting(page);
  const header = page.getByTestId("meeting-header-form");
  await header.getByLabel(M.subject).fill(title);
  await header.getByLabel(M.startDate).fill("2026-10-20");
  await header.getByLabel(M.location).fill("Board room");
  await page.getByTestId("meeting-save").click();
  await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();

  const panel = page.getByTestId("participants-panel");
  await panel
    .getByRole("group", { name: GARY })
    .getByRole("radio", { name: M.attendance.attended, exact: true })
    .check();
  await panel
    .getByRole("group", { name: /^Test2Firstname/ })
    .getByRole("radio", { name: M.attendance.apology, exact: true })
    .check();
  await page.getByTestId("participants-save").click();
  await expect(page.getByTestId("participants-save")).toBeDisabled();

  await addAgendaItem(page, "Budget");
  await addDiscussionPoint(page, "Budget", "Over by five percent");
  await addAction(page, "Over by five percent", {
    text: "Send the revised budget",
    person: GARY,
    due: "2026-11-02",
  });

  await page.getByTestId("minutes-print-link").click();
  await page.waitForURL(/\/projects\/2\/meetings\/\d+\/print$/);
  const printed = page.getByTestId("printed-minutes");
  await expect(printed.getByRole("heading", { name: title, level: 1 })).toBeVisible();
  await expect(printed).toContainText("Board room");
  await expect(page.getByTestId("print-present")).toContainText(
    "Gary Cantrall - Software Engineer, Organization and efficiency",
  );
  await expect(page.getByTestId("print-apologies")).toContainText("Test2Firstname");
  await expect(page.getByTestId("print-agenda-item")).toHaveText([/1\.\s*Budget/]);
  await expect(page.getByTestId("print-discussion-point")).toContainText("Over by five percent");
  const row = page.getByTestId("print-actions").getByRole("row").nth(1);
  await expect(row.getByRole("cell")).toHaveText([
    "Send the revised budget",
    "Gary Cantrall",
    "Nov 2, 2026",
    M.actionStatus["in-progress"],
  ]);

  // No app chrome: no project navigation, no header bar.
  await expect(page.getByRole("navigation", { name: messages.projects.sectionsNav })).toHaveCount(
    0,
  );
  await expect(page.getByRole("banner")).toHaveCount(0);
  expect(await axeClean(page)).toEqual([]);

  // Print minutes opens the print dialog (stubbed here) and leaves the page as it is.
  await page.evaluate(() => {
    window.print = () => document.body.setAttribute("data-printed", "true");
  });
  await page.getByTestId("print-minutes").click();
  await expect(page.locator("body")).toHaveAttribute("data-printed", "true");

  await page.getByRole("link", { name: M.backToMeeting }).click();
  await page.waitForURL(/\/projects\/2\/meetings\/\d+$/);
});

test("print: a meeting of another project is not found", async ({ page }) => {
  await page.goto("/projects/2/meetings/2/print");
  await expect(page.getByRole("heading", { name: messages.app.notFoundTitle })).toBeVisible();
  await expect(page.getByTestId("printed-minutes")).toHaveCount(0);
});

test("follow-ups: an action takes many, each with its person and dates (ADR-0043)", async ({
  page,
}) => {
  const minutes = await newMeeting(page);
  await addAgendaItem(page, "Budget");
  await addAction(page, "Budget", { text: "Send the revised budget" });

  await addFollowUp(page, "Send the revised budget", {
    text: "Chased the finance team",
    person: GARY,
    on: "2026-10-18",
    due: "2026-10-20",
  });
  await addFollowUp(page, "Send the revised budget", { text: "Still waiting" });

  const action = page.getByTestId("action-item").filter({ hasText: "Send the revised" });
  const followUps = action.getByTestId("follow-up");
  await expect(followUps).toHaveCount(2);
  await expect(followUps.first()).toContainText("Chased the finance team");
  await expect(followUps.first()).toContainText("Gary Cantrall");
  await expect(followUps.first()).toContainText("Oct 20, 2026");

  // Newest goes last; moving one up reorders them and keeps focus on the button.
  await followUps
    .nth(1)
    .getByRole("button", { name: M.moveUp("Still waiting") })
    .click();
  await expect(followUps.first()).toContainText("Still waiting");
  await expect(page.getByRole("button", { name: M.moveDown("Still waiting") })).toBeFocused();

  // A follow-up carries no status of its own: the action owns the one status.
  await expect(followUps.first().getByTestId("action-status")).toHaveCount(0);

  // Deleting the action takes its follow-ups with it.
  await action.getByRole("button", { name: M.deleteItem("Send the revised budget") }).click();
  await page.getByRole("button", { name: messages.actions.delete, exact: true }).last().click();
  await expect(page.getByTestId("action-item")).toHaveCount(0);
  await expect(minutes.getByTestId("follow-up")).toHaveCount(0);
});

test("status: completing an action takes it off the open list (ADR-0043)", async ({ page }) => {
  const minutes = await newMeeting(page);
  await addAgendaItem(page, "Budget");
  await addAction(page, "Budget", { text: "Send the revised budget", due: "2099-12-31" });
  await addAction(page, "Budget", { text: "Book the room", status: M.actionStatus["on-hold"] });

  // On hold still counts as open; only completed drops out.
  await expect(minutes.getByTestId("open-action")).toHaveCount(2);

  const action = page.getByTestId("action-item").filter({ hasText: "Send the revised" });
  await action
    .getByLabel(M.setStatusOf("Send the revised budget"))
    .selectOption(M.actionStatus.completed);
  await expect(minutes.getByTestId("open-action")).toHaveCount(1);
  await expect(minutes.getByTestId("open-action")).toContainText("Book the room");

  // It survives a reload, and the action is still there to re-open.
  await page.reload();
  await expect(
    page
      .getByTestId("action-item")
      .filter({ hasText: "Send the revised" })
      .getByLabel(M.setStatusOf("Send the revised budget")),
  ).toHaveValue("completed");
});

test("on hold: the reason is asked for before the status is written (ADR-0044)", async ({
  page,
}) => {
  const minutes = await newMeeting(page);
  await addAgendaItem(page, "Budget");
  await addAction(page, "Budget", { text: "Order the licences" });

  const action = page.getByTestId("action-item").filter({ hasText: "Order the licences" });
  const picker = action.getByLabel(M.setStatusOf("Order the licences"));

  // Picking the hold opens the dialog and writes nothing yet, so cancelling it
  // leaves the select on the status the row still has.
  await picker.selectOption(M.actionStatus["on-hold"]);
  await expect(page.getByTestId("on-hold-reason")).toBeVisible();
  await page.getByRole("button", { name: messages.actions.cancel }).last().click();
  await expect(page.getByTestId("on-hold-reason")).toHaveCount(0);
  await expect(picker).toHaveValue("in-progress");

  // Answering it writes the status and the reason together.
  await picker.selectOption(M.actionStatus["on-hold"]);
  await expect(page.getByTestId("on-hold-reason")).toBeVisible();
  await page.getByTestId("on-hold-reason").fill("Waiting on the supplier");
  await page.getByTestId("hold-with-reason").click();
  await expect(action.getByTestId("on-hold-reason-note")).toContainText("Waiting on the supplier");
  // On hold still counts as open (ADR-0043).
  await expect(minutes.getByTestId("open-action")).toHaveCount(1);

  // It survives a reload, and completing the action clears it: only a hold
  // carries a reason (CK_MeetingActionItem_OnHoldReason).
  await page.reload();
  const reloaded = page.getByTestId("action-item").filter({ hasText: "Order the licences" });
  await expect(reloaded.getByTestId("on-hold-reason-note")).toContainText(
    "Waiting on the supplier",
  );
  await reloaded
    .getByLabel(M.setStatusOf("Order the licences"))
    .selectOption(M.actionStatus.completed);
  await expect(reloaded.getByTestId("on-hold-reason-note")).toHaveCount(0);
  await page.reload();
  await expect(
    page
      .getByTestId("action-item")
      .filter({ hasText: "Order the licences" })
      .getByTestId("on-hold-reason-note"),
  ).toHaveCount(0);
});

test("carry-over: an unfinished action follows into the project's later meetings (ADR-0043)", async ({
  page,
}) => {
  const stamp = Date.now();
  const earlier = `E2E carry source ${stamp}`;

  await newMeeting(page);
  const header = page.getByTestId("meeting-header-form");
  await header.getByLabel(M.subject).fill(earlier);
  await header.getByLabel(M.startDate).fill("2026-10-01");
  await page.getByTestId("meeting-save").click();
  await expect(page.getByRole("heading", { name: earlier, level: 1 })).toBeVisible();
  await addAgendaItem(page, "Budget");
  await addAction(page, "Budget", { text: `Sign off the scope ${stamp}`, due: "2020-01-15" });
  const earlierUrl = page.url();

  // A later meeting of the same project inherits it, marked overdue.
  const minutes = await newMeeting(page);
  const laterHeader = page.getByTestId("meeting-header-form");
  await laterHeader.getByLabel(M.subject).fill(`E2E carry target ${stamp}`);
  await laterHeader.getByLabel(M.startDate).fill("2026-10-15");
  await page.getByTestId("meeting-save").click();
  await page.reload();

  const carried = minutes
    .getByTestId("carried-over-action")
    .filter({ hasText: `Sign off the scope ${stamp}` });
  await expect(carried).toHaveCount(1);
  await expect(carried).toContainText(M.overdue);
  await expect(carried).toContainText(M.carriedFrom(earlier));

  // It is not one of this meeting's own actions, and it is not in its open list.
  await expect(minutes.getByTestId("action-item")).toHaveCount(0);
  await expect(minutes.getByTestId("open-actions")).toContainText(M.noOpenActions);

  // Completing it here clears it from this meeting and from the one that raised it.
  await carried
    .getByLabel(M.setStatusOf(`Sign off the scope ${stamp}`))
    .selectOption(M.actionStatus.completed);
  await expect(
    minutes.getByTestId("carried-over-action").filter({ hasText: `Sign off the scope ${stamp}` }),
  ).toHaveCount(0);

  await page.goto(earlierUrl);
  await expect(page.getByTestId("open-actions")).toContainText(M.noOpenActions);
});

test("layout: present and apologies sit under the Location field, not in a side column", async ({
  page,
}) => {
  await page.goto("/projects/2/meetings/1");
  const header = page.getByTestId("meeting-header-form");
  await expect(header.getByLabel(M.location)).toBeVisible();
  const panel = page.getByTestId("participants-panel");
  await expect(panel).toBeVisible();

  // Location is the last field of the header form, and the panel follows the form.
  const order = await page.evaluate(() => {
    const location = document.querySelector<HTMLElement>('[name="location"]');
    const participants = document.querySelector<HTMLElement>('[data-testid="participants-panel"]');
    if (!location || !participants) return null;
    const relation = location.compareDocumentPosition(participants);
    return {
      panelFollowsLocation: Boolean(relation & Node.DOCUMENT_POSITION_FOLLOWING),
      panelInsideForm: Boolean(location.closest("form")?.contains(participants)),
    };
  });
  expect(order).toEqual({ panelFollowsLocation: true, panelInsideForm: false });
  expect(await axeClean(page)).toEqual([]);
});
