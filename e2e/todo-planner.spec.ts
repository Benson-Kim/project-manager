import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page, type Request } from "@playwright/test";
import { messages } from "../src/lib/messages";
import { addDays, HOUR_PX } from "../src/modules/todo-items/planner";
import { closeAlarmToast } from "./support/alarms";

/**
 * To-do Planner: three days at a time, 24 hours from 08:00, entries typed, dragged,
 * stretched and moved. Runs as e2e-pm on project 2.
 */
const P = messages.todoItems.planner;
const today = () => new Date().toISOString().slice(0, 10);

async function openPlanner(page: Page, path: string, day: string) {
  await page.goto(`${path}?view=planner&days=${day}`);
  await closeAlarmToast(page);
  await expect(page.getByTestId("todo-planner")).toBeVisible();
  await page.getByTestId("planner-scroll").scrollIntoViewIfNeeded();
}

function plannerEntry(page: Page, day: string, title: string): Locator {
  return page
    .getByTestId(`planner-day-${day}`)
    .getByTestId("planner-entry")
    .filter({ hasText: title });
}

async function seriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations.filter((v) => ["serious", "critical"].includes(v.impact ?? ""));
}

async function drag(page: Page, from: { x: number; y: number }, dy: number, dx = 0) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 8 });
  await page.mouse.up();
}

async function saveTodo(page: Page, form: Locator, title: string) {
  const actions: Array<{ status: number | null; result: string }> = [];
  const capture = (request: Request) => {
    if (request.method() !== "POST" || !request.headers()["next-action"]) return;
    const action = { status: null as number | null, result: "pending" };
    actions.push(action);
    void request
      .response()
      .then(async (response) => {
        action.status = response?.status() ?? null;
        const body = await response?.text();
        action.result = body?.includes('"ok":true')
          ? "ok"
          : (/"code":"([A-Z_]+)"/.exec(body ?? "")?.[1] ?? "no result");
      })
      .catch(() => {
        action.result = "response unavailable";
      });
  };
  page.on("request", capture);
  try {
    await page.getByTestId("todo-item-save").click();
    await expect(form).toHaveCount(0, { timeout: 15_000 });
  } catch (cause) {
    const state = {
      url: new URL(page.url()).pathname + new URL(page.url()).search,
      titleKept: (await form.getByLabel(messages.todoItems.todoItem).inputValue()) === title,
      disabled: await page.getByTestId("todo-item-save").isDisabled(),
      alerts: await page.getByRole("alert").allTextContents(),
      success: await page.getByTestId("toast-success").allTextContents(),
      actions,
    };
    throw new Error(`To-do save state: ${JSON.stringify(state)}`, { cause });
  } finally {
    page.off("request", capture);
  }
}

test("planner — three days at a time, opens at 08:00, switches with Month", async ({ page }) => {
  const day = today();
  await openPlanner(page, "/todo", day);
  for (const offset of [0, 1, 2]) {
    await expect(page.getByTestId(`planner-day-${addDays(day, offset)}`)).toBeVisible();
  }
  await expect(page.getByTestId(`planner-day-${addDays(day, 3)}`)).toHaveCount(0);
  const top = await page.getByTestId("planner-scroll").evaluate((el) => el.scrollTop);
  expect(Math.abs(top - 8 * HOUR_PX)).toBeLessThan(HOUR_PX);
  expect(await seriousViolations(page)).toEqual([]);

  await page.getByTestId("planner-next").click();
  await expect(page).toHaveURL(new RegExp(`days=${addDays(day, 3)}`));
  await expect(page.getByTestId(`planner-day-${addDays(day, 5)}`)).toBeVisible();
  await page.getByTestId("planner-previous").click();
  await expect(page.getByTestId(`planner-day-${day}`)).toBeVisible();

  await page.getByTestId("calendar-mode-month").click();
  await expect(page.getByTestId("todo-calendar")).toBeVisible();
  await page.getByTestId("calendar-mode-planner").click();
  await expect(page.getByTestId("todo-planner")).toBeVisible();
});

test("planner — type 14:00-15:00, set 08:30-08:42, see the list marker, take it off", async ({
  page,
}) => {
  test.slow();
  const title = `E2E planner ${Date.now()}`;
  const day = today();
  await openPlanner(page, "/projects/2/calendar", day);

  await page.getByTestId("planner-new-entry").click();
  const form = page.getByTestId("planner-entry-form");
  await form.getByLabel(P.title, { exact: true }).fill(title);
  await form.getByLabel(P.day, { exact: true }).selectOption(day);
  await form.getByLabel(P.start, { exact: true }).fill("15:00");
  await form.getByLabel(P.end, { exact: true }).fill("14:00");
  await form.getByRole("button", { name: P.save }).click();
  await expect(page.getByTestId("planner-error")).toBeVisible();
  await form.getByLabel(P.start, { exact: true }).fill("14:00");
  await form.getByLabel(P.end, { exact: true }).fill("15:00");
  await form.getByRole("button", { name: P.save }).click();
  await expect(form).toHaveCount(0, { timeout: 15_000 });
  const entry = plannerEntry(page, day, title);
  await expect(entry).toContainText("14:00-15:00");

  await entry.click();
  const selected = page.getByTestId("planner-selected");
  await expect(selected).toContainText(title);
  await selected.getByLabel(P.start, { exact: true }).fill("08:30");
  await selected.getByLabel(P.end, { exact: true }).fill("08:42");
  await selected.getByRole("button", { name: P.save }).click();
  await expect(entry).toContainText("08:30-08:42", { timeout: 15_000 });

  await page.goto(`/projects/2/todos?q=${encodeURIComponent(title)}`);
  const marker = page.getByTestId("todo-calendar-marker").first();
  await expect(marker).toBeVisible();
  await expect(marker).toHaveAttribute("title", P.markerTitle(`${day} 08:30-08:42`));

  await openPlanner(page, "/projects/2/calendar", day);
  await entry.click();
  await selected.getByRole("button", { name: P.unschedule }).click();
  await expect(entry).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByTestId("planner-todo").filter({ hasText: title })).toBeVisible();
});

test("planner — drag a to-do onto 14:00, stretch to 15:30, move an hour, delete", async ({
  page,
}) => {
  test.slow();
  const title = `E2E planner drag ${Date.now()}`;
  const day = today();
  await page.goto("/projects/2/todos");
  await closeAlarmToast(page);
  await page.getByTestId("new-todo-item").click();
  const form = page.getByTestId("todo-item-form");
  await form.getByLabel(messages.todoItems.todoItem).fill(title);
  await saveTodo(page, form, title);

  await openPlanner(page, "/projects/2/calendar", day);
  const todo = page.getByTestId("planner-todo").filter({ hasText: title });
  await expect(todo).toBeVisible();
  const column = (await page.getByTestId(`planner-day-${day}`).boundingBox())!;
  const source = (await todo.boundingBox())!;
  const at = { x: source.x + source.width / 2, y: source.y + source.height / 2 };
  const target = { x: column.x + column.width / 2, y: column.y + 14 * HOUR_PX + 4 };
  await drag(page, at, target.y - at.y, target.x - at.x);
  const entry = plannerEntry(page, day, title);
  await expect(entry).toContainText("14:00-15:00", { timeout: 15_000 });

  const handle = (await entry.getByTestId("planner-entry-resize").boundingBox())!;
  await drag(
    page,
    { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 },
    HOUR_PX / 2,
  );
  await expect(entry).toContainText("14:00-15:30", { timeout: 15_000 });

  const body = (await entry.boundingBox())!;
  await drag(page, { x: body.x + body.width / 2, y: body.y + 10 }, HOUR_PX);
  await expect(entry).toContainText("15:00-16:30", { timeout: 15_000 });

  await entry.click();
  await page
    .getByTestId("planner-selected")
    .getByRole("button", { name: messages.actions.delete })
    .click();
  await page
    .getByRole("alertdialog")
    .or(page.getByRole("dialog"))
    .getByRole("button", { name: messages.actions.delete })
    .click();
  await expect(entry).toHaveCount(0, { timeout: 15_000 });
});
