import { expect, test, type Locator, type Page } from "@playwright/test";
import { messages } from "../src/lib/messages";
import { closeAlarmToast } from "./support/alarms";
import { waitForRichTextEditors } from "./support/editor";
import { listedPeople } from "./support/picker";

/**
 * The shared stakeholder picker at each place it is used: search narrows the list, a click picks,
 * and "Add new", always the first item, creates the typed name in place and picks it without
 * leaving the page. Runs as e2e-pm (storage state from auth.setup.ts), a Manager on project 2 who
 * may create stakeholders.
 */

const D = messages.decisions;
const M = messages.meetings;
const P = messages.projects;
const S = messages.stakeholders;

/** Opens the list, takes the first person in it, finds them again by typing and picks them. */
async function searchAndPick(scope: Locator, box: Locator): Promise<string> {
  await expect(async () => {
    await box.click();
    await expect(listedPeople(scope).first()).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  const name = ((await listedPeople(scope).first().textContent()) ?? "").trim();
  expect(name).not.toBe("");
  await box.fill(name);
  await expect(listedPeople(scope).first()).toHaveText(name);
  await listedPeople(scope).getByText(name, { exact: true }).first().click();
  return name;
}

/** Types a new name, takes "Add new", checks the in-place form starts from it and saves it. */
async function addNew(page: Page, scope: Locator, box: Locator, typed: string): Promise<void> {
  const url = page.url();
  await box.click();
  await box.fill(typed);
  const options = scope.getByRole("listbox").getByRole("option");
  await expect(options.first()).toHaveAttribute("data-testid", "combobox-add-new");
  await scope.getByTestId("combobox-add-new").click();
  const quick = page.getByTestId("stakeholder-quick-create");
  const [first, ...rest] = typed.split(" ");
  await expect(quick.getByLabel(S.firstName)).toHaveValue(first);
  await expect(quick.getByLabel(S.lastName)).toHaveValue(rest.join(" "));
  await quick.getByRole("button", { name: messages.actions.save }).click();
  await expect(quick).toBeHidden({ timeout: 15_000 });
  expect(page.url()).toBe(url);
}

async function decisionForm(page: Page): Promise<Locator> {
  await page.goto("/projects/2/decisions?id=new");
  await closeAlarmToast(page);
  const form = page.getByTestId("decision-form");
  await expect(form).toBeVisible();
  await waitForRichTextEditors(form);
  return form;
}

/** A new meeting with one agenda item, ready for actions under it. */
async function meetingWithAgendaItem(page: Page, agendaItem: string): Promise<void> {
  await page.goto("/projects/2/meetings");
  await page.getByTestId("new-meeting").click();
  await page.waitForURL(/\/projects\/2\/meetings\/\d+$/);
  await expect(
    page
      .getByTestId("meeting-header-form")
      .getByRole("textbox", { name: M.objective, exact: true }),
  ).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: M.addAgendaItem, exact: true }).click();
  const form = page.getByRole("form", { name: M.addAgendaItem });
  await form.getByLabel(M.agendaItem, { exact: true }).fill(agendaItem);
  await form.getByRole("button", { name: messages.actions.save }).click();
  await expect(form).toHaveCount(0);
}

test("the decision owner is searched, picked, and added new in place", async ({ page }) => {
  const form = await decisionForm(page);
  const owner = form.getByRole("combobox", { name: D.owner, exact: true });

  const name = await searchAndPick(form, owner);
  await expect(owner).toHaveValue(name);

  const newcomer = `E2E Zzowner${Date.now()}`;
  await addNew(page, form, owner, newcomer);
  await expect(owner).toHaveValue(newcomer);
});

test("consulted people are searched, picked, and added new in place", async ({ page }) => {
  const form = await decisionForm(page);
  const consulted = form.getByRole("combobox", { name: D.consulted, exact: true });

  const name = await searchAndPick(form, consulted);
  await expect(form.getByRole("button", { name: D.removeChip(name) })).toBeVisible();
  await expect(consulted).toHaveValue("");

  const newcomer = `E2E Zzconsulted${Date.now()}`;
  await addNew(page, form, consulted, newcomer);
  await expect(form.getByRole("button", { name: D.removeChip(newcomer) })).toBeVisible();
  await expect(consulted).toHaveValue("");
});

test("a meeting action's person responsible is searched, picked, and added new in place", async ({
  page,
}) => {
  await meetingWithAgendaItem(page, "Owners");
  await page.getByRole("button", { name: M.addActionTo("Owners") }).click();
  const form = page.getByRole("form", { name: M.addAction });
  const text = `Name an owner ${Date.now()}`;
  await form.getByLabel(M.action, { exact: true }).fill(text);
  const person = form.getByRole("combobox", { name: M.personResponsible });

  const name = await searchAndPick(form, person);
  await expect(person).toHaveValue(name);

  const newcomer = `E2E Zzaction${Date.now()}`;
  await addNew(page, form, person, newcomer);
  await expect(person).toHaveValue(newcomer);
  await form.getByRole("button", { name: messages.actions.save }).click();
  await expect(form).toHaveCount(0);
  await expect(page.getByTestId("action-item").filter({ hasText: text })).toContainText(newcomer);
});

test("a follow-up's person is searched, picked, and added new in place", async ({ page }) => {
  await meetingWithAgendaItem(page, "Chasers");
  await page.getByRole("button", { name: M.addActionTo("Chasers") }).click();
  const actionForm = page.getByRole("form", { name: M.addAction });
  const action = `Chase the supplier ${Date.now()}`;
  await actionForm.getByLabel(M.action, { exact: true }).fill(action);
  await actionForm.getByRole("button", { name: messages.actions.save }).click();
  await expect(actionForm).toHaveCount(0);

  await page.getByRole("button", { name: M.addFollowUpTo(action) }).click();
  const form = page.getByRole("form", { name: M.addFollowUp });
  await form.getByLabel(M.followUp, { exact: true }).fill("Called them");
  const person = form.getByRole("combobox", { name: M.assignedTo });

  const name = await searchAndPick(form, person);
  await expect(person).toHaveValue(name);

  const newcomer = `E2E Zzfollowup${Date.now()}`;
  await addNew(page, form, person, newcomer);
  await expect(person).toHaveValue(newcomer);
  await form.getByRole("button", { name: messages.actions.save }).click();
  await expect(form).toHaveCount(0);
  await expect(page.getByTestId("follow-up").filter({ hasText: "Called them" })).toContainText(
    newcomer,
  );
});

test("the Overview team's new-member box is searched, picked, and added new in place", async ({
  page,
}) => {
  await page.goto("/projects/2");
  await closeAlarmToast(page);
  const row = page.getByTestId("team-add-row");
  const box = row.getByRole("combobox", { name: P.assigneeName, exact: true });
  const addToTeam = row.getByRole("button", { name: P.addAssignee });

  const name = await searchAndPick(row, box);
  await expect(box).toHaveValue(name);
  await expect(addToTeam).toBeEnabled();

  const newcomer = `E2E Zzteam${Date.now()}`;
  await addNew(page, row, box, newcomer);
  await expect(box).toHaveValue(newcomer);
  await addToTeam.click();
  const team = page.getByTestId("assignee-list");
  const remove = team.getByRole("button", { name: P.removeAssignee(newcomer) });
  await expect(remove).toBeVisible({ timeout: 15_000 });

  // Back out of the shared project's team, so reruns on the same database do not pile up members.
  await remove.click();
  await expect(remove).toHaveCount(0, { timeout: 15_000 });
});
