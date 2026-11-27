import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page, type Request } from "@playwright/test";
import { messages } from "../src/lib/messages";
import { addDays, HOUR_PX } from "../src/modules/todo-items/planner";
import { closeAlarmToast } from "./support/alarms";
import { calendarEntry, localDay } from "./support/calendar";
import { openListed } from "./support/datasheet";
import { waitForRichTextEditors } from "./support/editor";

/**
 * To-do Planner: three days at a time, 24 hours from 08:00, entries typed, dragged,
 * stretched and moved. Runs as e2e-pm on project 2.
 */
const P = messages.todoItems.planner;
const today = () => localDay();

async function openPlanner(page: Page, path: string, day: string) {
  await page.goto(`${path}?view=planner&days=${day}`);
  await closeAlarmToast(page);
  await expect(page.getByTestId("todo-planner")).toBeVisible();
  // The planner scrolls to 08:00 once it runs on the client; before that, typed values are lost.
  await expect
    .poll(() => page.getByTestId("planner-scroll").evaluate((el) => el.scrollTop))
    .toBeGreaterThan(0);
  await page.getByTestId("planner-scroll").scrollIntoViewIfNeeded();
}

function plannerEntry(page: Page, day: string, title: string): Locator {
  return page
    .getByTestId(`planner-day-${day}`)
    .getByTestId("planner-entry")
    .filter({ hasText: title });
}

async function newTodo(page: Page, title: string, startDate?: string) {
  await page.goto("/projects/2/todos");
  await closeAlarmToast(page);
  await page.getByTestId("new-todo-item").click();
  const form = page.getByTestId("todo-item-form");
  await waitForRichTextEditors(form);
  await form.getByLabel(messages.todoItems.todoItem).fill(title);
  if (startDate) await form.getByLabel(messages.todoItems.startDate).fill(startDate);
  await saveTodo(page, form, title);
}

async function deleteTodo(page: Page, title: string) {
  await page.goto(`/projects/2/todos?q=${encodeURIComponent(title)}`);
  await openListed(page, title);
  await page.getByTestId("todo-item-delete").click();
  await page.getByRole("button", { name: messages.actions.delete, exact: true }).last().click();
  await expect(page.getByTestId("todo-item-form")).toHaveCount(0, { timeout: 15_000 });
}

async function book(page: Page, title: string, day: string, start: string, end: string) {
  const form = page.getByTestId("planner-place");
  await form.getByLabel(P.todos, { exact: true }).selectOption({ label: title });
  await form.getByLabel(P.day, { exact: true }).selectOption(day);
  await form.getByLabel(P.start, { exact: true }).fill(start);
  await form.getByLabel(P.end, { exact: true }).fill(end);
  await form.getByRole("button", { name: P.schedule }).click();
  await expect(plannerEntry(page, day, title)).toContainText(`${start}-${end}`, {
    timeout: 15_000,
  });
  // The block shows before the server answers; the to-do leaves the unplaced list once it has.
  await expect(
    form.getByLabel(P.todos, { exact: true }).locator("option", { hasText: title }),
  ).toHaveCount(0, { timeout: 15_000 });
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
    await waitForRichTextEditors(form);
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

  const column = page.getByTestId(`planner-day-${day}`);
  const box = (await column.boundingBox())!;
  const x = box.x + box.width / 2;
  await page.getByTestId("planner-scroll").evaluate((el, px) => (el.scrollTop = px), 9 * HOUR_PX);
  const columnTop = (await column.boundingBox())!.y;
  await page.mouse.move(x, columnTop + 10 * HOUR_PX + 2);
  await page.mouse.down();
  await page.mouse.move(x, columnTop + 11.25 * HOUR_PX + 2, { steps: 5 });
  await expect(page.getByTestId("planner-sweep")).toBeVisible();
  await page.mouse.up();
  await expect(page.getByTestId("planner-sweep")).toHaveCount(0);
  const form = page.getByTestId("planner-entry-form");
  await expect(form).toBeVisible();
  const values = await form
    .locator("input, select")
    .evaluateAll((controls) => controls.map((c) => (c as HTMLInputElement).value));
  expect(values).toEqual(expect.arrayContaining(["10:00", "11:30"]));
  await page.keyboard.press("Escape");

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
  const day = addDays(today(), 1);
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
  // The block moves before the server answers: leave only once the save has settled.
  await expect(selected.getByRole("button", { name: P.save })).toBeEnabled({ timeout: 15_000 });
  await expect(page.getByTestId("planner-error")).toHaveCount(0);

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
  const day = addDays(today(), 1);
  await newTodo(page, title);

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

test("planner — a to-do booked for tomorrow shows in Month on that day with its time", async ({
  page,
}) => {
  test.slow();
  const title = `E2E planner month ${Date.now()}`;
  const day = addDays(today(), 1);
  await newTodo(page, title);
  try {
    await openPlanner(page, "/projects/2/calendar", day);
    await book(page, title, day, "14:00", "15:00");
    await page.getByTestId("calendar-mode-month").click();
    await expect(page.getByTestId("todo-calendar")).toBeVisible();
    await expect(await calendarEntry(page, day, title)).toContainText("14:00");
  } finally {
    await deleteTodo(page, title);
  }
});

test("planner — a daily to-do booked 09:00-10:00 shows on all three days", async ({ page }) => {
  test.slow();
  const R = messages.todoItems.repeat;
  const title = `E2E planner daily ${Date.now()}`;
  const day = addDays(today(), 1);
  await newTodo(page, title, day);
  try {
    await page.goto(`/projects/2/todos?q=${encodeURIComponent(title)}`);
    await openListed(page, title);
    await page.getByTestId("todo-repeat").getByRole("button", { name: R.configure }).click();
    const rule = page.getByTestId("todo-repeat-form");
    await rule.getByLabel(R.unit, { exact: true }).selectOption("Day");
    await rule.getByLabel(R.ends, { exact: true }).selectOption("after");
    await rule.getByLabel(R.endsAfterCount, { exact: true }).fill("5");
    await page.getByTestId("todo-repeat-save").click();
    await expect(
      page.getByTestId("toast-success").filter({ hasText: messages.feedback.saved }).first(),
    ).toBeVisible({ timeout: 15_000 });

    await openPlanner(page, "/projects/2/calendar", day);
    await book(page, title, day, "09:00", "10:00");
    for (const offset of [1, 2]) {
      const copy = plannerEntry(page, addDays(day, offset), title);
      await expect(copy).toContainText("09:00-10:00");
      await expect(copy.getByTestId("planner-entry-resize")).toHaveCount(0);
    }
  } finally {
    await deleteTodo(page, title);
  }
});

test("planner — Month carries its month, a day's planner icon opens that day", async ({ page }) => {
  const day = addDays(today(), 3);
  const month = day.slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  await page.goto(`/projects/2/calendar?month=${month}`);
  await closeAlarmToast(page);
  await expect(page.getByTestId("todo-calendar")).toBeVisible();

  await page.locator(`[data-testid="calendar-plan"][data-day="${day}"]:visible`).click();
  await expect(page.getByTestId("todo-planner")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`days=${day}`));
  for (const offset of [0, 1, 2]) {
    await expect(page.getByTestId(`planner-day-${addDays(day, offset)}`)).toBeVisible();
  }

  await page.getByTestId("calendar-mode-month").click();
  await expect(page.getByTestId("todo-calendar")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`month=${month}`));
  await page.getByTestId("calendar-next").click();
  await expect(page).toHaveURL(new RegExp(`month=${next}`));
  await page.getByTestId("calendar-mode-planner").click();
  await expect(page.getByTestId("todo-planner")).toBeVisible();
  await expect(page.getByTestId(`planner-day-${next}-01`)).toBeVisible();
});

test("planner — a booking that starts earlier today is refused", async ({ page }) => {
  test.slow();
  const now = new Date();
  test.skip(now.getHours() === 0 && now.getMinutes() < 2, "no earlier minute today yet");
  const title = `E2E planner past ${Date.now()}`;
  const day = today();
  await newTodo(page, title);
  try {
    await openPlanner(page, "/projects/2/calendar", day);
    const form = page.getByTestId("planner-place");
    await form.getByLabel(P.todos, { exact: true }).selectOption({ label: title });
    await form.getByLabel(P.day, { exact: true }).selectOption(day);
    await form.getByLabel(P.start, { exact: true }).fill("00:00");
    await form.getByLabel(P.end, { exact: true }).fill("00:01");
    await form.getByRole("button", { name: P.schedule }).click();
    await expect(page.getByTestId("planner-error")).toHaveText(P.past);
    await expect(plannerEntry(page, day, title)).toHaveCount(0);
  } finally {
    await deleteTodo(page, title);
  }
});

test("planner — a to-do dropped on a past hour stays put until its time is fixed", async ({
  page,
}) => {
  test.slow();
  const now = new Date();
  test.skip(now.getHours() === 0 && now.getMinutes() < 2, "no earlier minute today yet");
  const title = `E2E planner held ${Date.now()}`;
  const day = today();
  await newTodo(page, title);
  try {
    await openPlanner(page, "/projects/2/calendar", day);
    const todo = page.getByTestId("planner-todo").filter({ hasText: title });

    // Drop the list item on an hour that has already passed today, so the drop cannot be
    // booked straight away and the block is held where it landed.
    async function dropOnPastHour() {
      const nowMin = await page.evaluate(
        () => new Date().getHours() * 60 + new Date().getMinutes(),
      );
      const dropPx = (Math.max(0, nowMin - 90) * HOUR_PX) / 60;
      await page
        .getByTestId("planner-scroll")
        .evaluate((el, top) => {
          el.scrollTop = top;
        }, Math.max(0, dropPx - 100));
      await expect(todo).toBeVisible();
      const column = (await page.getByTestId(`planner-day-${day}`).boundingBox())!;
      const source = (await todo.boundingBox())!;
      const at = { x: source.x + source.width / 2, y: source.y + source.height / 2 };
      const target = { x: column.x + column.width / 2, y: column.y + dropPx + 4 };
      await drag(page, at, target.y - at.y, target.x - at.x);
    }

    await dropOnPastHour();
    const held = plannerEntry(page, day, title);
    await expect(held).toBeVisible();
    await expect(held).toHaveAttribute("data-held", "true");
    await expect(page.getByTestId("planner-held-hint")).toBeVisible();
    await expect(page.getByTestId("planner-error")).toHaveText(P.past);

    // Cancel puts the held to-do back in the list; nothing is booked.
    await page.getByTestId("planner-selected").getByRole("button", { name: P.cancel }).click();
    await expect(plannerEntry(page, day, title)).toHaveCount(0);
    await expect(todo).toBeVisible();

    // Drop it again, fix the time to a valid future slot, and Save confirms the booking.
    await dropOnPastHour();
    await expect(plannerEntry(page, day, title)).toHaveAttribute("data-held", "true");
    const tomorrow = addDays(today(), 1);
    const panel = page.getByTestId("planner-selected");
    await panel.getByLabel(P.day, { exact: true }).selectOption(tomorrow);
    await panel.getByLabel(P.start, { exact: true }).fill("09:00");
    await panel.getByLabel(P.end, { exact: true }).fill("10:00");
    await panel.getByRole("button", { name: P.save }).click();
    await expect(plannerEntry(page, tomorrow, title)).toContainText("09:00-10:00", {
      timeout: 15_000,
    });
    await expect(todo).toHaveCount(0, { timeout: 15_000 });
  } finally {
    await deleteTodo(page, title);
  }
});

test("to-do list — the Calendar cell books a slot and warns before a clash", async ({ page }) => {
  test.slow();
  test.skip(new Date().getHours() >= 23, "no free slot left today");
  const stamp = Date.now();
  const first = `E2E cal ${stamp} A`;
  const second = `E2E cal ${stamp} B`;
  await newTodo(page, first);
  await newTodo(page, second);
  try {
    await page.goto(`/projects/2/todos?q=${encodeURIComponent(`E2E cal ${stamp}`)}`);
    await closeAlarmToast(page);
    const dialog = page.getByRole("dialog");
    async function book(title: string) {
      await page.getByRole("button", { name: P.openCalendar(title) }).click();
      const form = page.getByTestId("todo-calendar-form");
      await form.getByLabel(messages.todoItems.startDate).fill(today());
      await form.getByLabel(P.startTime).fill("23:20");
      await form.getByLabel(P.endTime).fill("23:50");
      await form.getByRole("button", { name: P.addToCalendar }).click();
    }
    await book(first);
    await expect(dialog).toHaveCount(0, { timeout: 15_000 });
    await book(second);
    const clash = page.getByTestId("todo-calendar-conflict");
    await expect(clash).toContainText(P.conflictBody);
    await clash.getByRole("button", { name: messages.actions.cancel }).click();
    await expect(page.getByTestId("todo-calendar-form").getByLabel(P.startTime)).toHaveValue(
      "23:20",
    );
    await page
      .getByTestId("todo-calendar-form")
      .getByRole("button", { name: P.addToCalendar })
      .click();
    await clash.getByRole("button", { name: P.continue }).click();
    await expect(dialog).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByRole("button", { name: P.openCalendar(second) })).toContainText("23:20");
  } finally {
    await deleteTodo(page, first);
    await deleteTodo(page, second);
  }
});
