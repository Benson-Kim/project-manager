import { describe, expect, it } from "vitest";
import { calendarEntries, calendarMonth, monthGrid } from "../calendar";
import type { RecurrenceRule } from "../recurrence";
import type { CalendarTodo, TodoOccurrenceRow } from "../schemas/todo-recurrence";

const WEEK = { from: "2026-11-01", to: "2026-11-07" };
const TODAY = "2026-11-04";

const daily: RecurrenceRule = {
  unit: "Day",
  every: 1,
  startTime: null,
  weekdays: null,
  monthMode: null,
  ordinal: null,
  weekday: null,
  endsOn: null,
  endsAfter: null,
};

function todo(over: Partial<CalendarTodo> = {}): CalendarTodo {
  return {
    todoItemId: 5,
    projectId: 2,
    projectName: "Bridge",
    title: "Inspect",
    startDate: "2026-10-30",
    dueDate: null,
    priority: null,
    status: "Not Started",
    assignee: null,
    rowVer: 9,
    actorAccess: "Manager",
    rule: null,
    ...over,
  };
}

function row(over: Partial<TodoOccurrenceRow> & { occursAt: string }): TodoOccurrenceRow {
  return {
    todoOccurrenceId: 1,
    todoItemId: 5,
    status: null,
    movedTo: null,
    isSkipped: false,
    rowVer: 30,
    ...over,
  };
}

const days = (r: ReturnType<typeof calendarEntries>) => r.entries.map((e) => e.day);

describe("calendarEntries", () => {
  it("shows a one-off on its start date, and only inside the window", () => {
    const shown = todo({ startDate: "2026-11-03" });
    const r = calendarEntries(
      [
        shown,
        todo({ todoItemId: 6, startDate: "2026-11-08" }),
        todo({ todoItemId: 7, startDate: null }),
      ],
      [],
      WEEK,
      TODAY,
    );
    expect(r).toEqual({
      entries: [
        {
          key: "5",
          todo: shown,
          day: "2026-11-03",
          time: null,
          status: "Not Started",
          occurrence: null,
        },
      ],
      cut: 0,
    });
  });

  it("shows each day of a daily series, its due date moved with it", () => {
    const r = calendarEntries([todo({ rule: daily, dueDate: "2026-11-01" })], [], WEEK, TODAY);
    expect(days(r)).toEqual([
      "2026-11-01",
      "2026-11-02",
      "2026-11-03",
      "2026-11-04",
      "2026-11-05",
      "2026-11-06",
      "2026-11-07",
    ]);
    expect(r.entries[0]).toMatchObject({
      key: "5@2026-11-01T00:00:00",
      time: null,
      status: null,
      occurrence: {
        occursAt: "2026-11-01T00:00:00",
        movedTo: null,
        isSkipped: false,
        dueDate: "2026-11-03",
        rowVer: null,
      },
    });
  });

  it("applies an occurrence's own status", () => {
    const r = calendarEntries(
      [todo({ rule: daily })],
      [row({ occursAt: "2026-11-02T00:00:00", status: "Completed" })],
      WEEK,
      TODAY,
    );
    expect(r.entries[1]).toMatchObject({
      day: "2026-11-02",
      status: "Completed",
      occurrence: { rowVer: 30 },
    });
  });

  it("shows a moved occurrence on its new day, and drops one moved out of the window", () => {
    const r = calendarEntries(
      [todo({ rule: daily, dueDate: "2026-11-01" })],
      [
        row({ occursAt: "2026-11-02T00:00:00", movedTo: "2026-11-06T00:00:00" }),
        row({ occursAt: "2026-11-03T00:00:00", movedTo: "2026-12-15T00:00:00" }),
      ],
      WEEK,
      TODAY,
    );
    expect(days(r)).toEqual([
      "2026-11-01",
      "2026-11-04",
      "2026-11-05",
      "2026-11-06",
      "2026-11-06",
      "2026-11-07",
    ]);
    const moved = r.entries.find((e) => e.key === "5@2026-11-02T00:00:00");
    expect(moved).toMatchObject({
      day: "2026-11-06",
      occurrence: { movedTo: "2026-11-06T00:00:00", dueDate: "2026-11-08" },
    });
  });

  it("brings in an occurrence moved from outside the window, if its rule still makes it", () => {
    const everyOther = { ...daily, every: 2 };
    const r = calendarEntries(
      [todo({ rule: everyOther, startDate: "2026-10-20" })],
      [
        row({ occursAt: "2026-10-28T00:00:00", movedTo: "2026-11-03T00:00:00" }),
        row({ occursAt: "2026-10-29T00:00:00", movedTo: "2026-11-05T00:00:00" }),
      ],
      WEEK,
      TODAY,
    );
    expect(r.entries.map((e) => e.key)).toEqual([
      "5@2026-11-01T00:00:00",
      "5@2026-10-28T00:00:00",
      "5@2026-11-03T00:00:00",
      "5@2026-11-05T00:00:00",
      "5@2026-11-07T00:00:00",
    ]);
  });

  it("keeps a skipped occurrence, flagged, so it can be shown and undone", () => {
    const r = calendarEntries(
      [todo({ rule: daily })],
      [row({ occursAt: "2026-11-05T00:00:00", isSkipped: true })],
      WEEK,
      TODAY,
    );
    expect(r.entries).toHaveLength(7);
    expect(r.entries[4]).toMatchObject({ day: "2026-11-05", occurrence: { isSkipped: true } });
  });

  it("ends a closed series' occurrences after today and keeps the past ones", () => {
    const r = calendarEntries([todo({ rule: daily, status: "Completed" })], [], WEEK, TODAY);
    expect(days(r)).toEqual(["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04"]);
  });

  it("cuts an hourly series at the cap, says so, and times each entry", () => {
    const hourly: RecurrenceRule = { ...daily, unit: "Hour", startTime: "09:30" };
    const grid = monthGrid("2026-11").window;
    const r = calendarEntries([todo({ rule: hourly, startDate: "2026-10-01" })], [], grid, TODAY);
    expect(r.cut).toBe(1);
    expect(r.entries).toHaveLength(1000);
    expect(r.entries.slice(0, 2).map((e) => [e.day, e.time])).toEqual([
      ["2026-10-26", "00:30"],
      ["2026-10-26", "01:30"],
    ]);
  });

  it("orders by day, then time, then title", () => {
    const r = calendarEntries(
      [
        todo({ todoItemId: 1, title: "Zinc", startDate: "2026-11-02" }),
        todo({ todoItemId: 2, title: "Alum", startDate: "2026-11-02" }),
        todo({ todoItemId: 3, title: "Alpha", startDate: "2026-11-01" }),
      ],
      [],
      WEEK,
      TODAY,
    );
    expect(r.entries.map((e) => e.todo.title)).toEqual(["Alpha", "Alum", "Zinc"]);
  });
});

describe("calendarMonth", () => {
  it("takes a well-formed month", () => {
    expect(calendarMonth("2027-02", TODAY)).toBe("2027-02");
  });

  it.each([undefined, "", "2026-13", "2026-00", "26-11", "2026-1", "2026-11-01", "1800-01"])(
    "falls back to today's month for %j",
    (value) => {
      expect(calendarMonth(value, TODAY)).toBe("2026-11");
    },
  );
});

describe("monthGrid", () => {
  it("covers six Monday-first weeks around the month", () => {
    const grid = monthGrid("2026-11");
    expect(grid.days).toHaveLength(42);
    expect(grid.days[0]).toBe("2026-10-26");
    expect(grid.days[6]).toBe("2026-11-01");
    expect(grid.days[41]).toBe("2026-12-06");
    expect(grid.window).toEqual({ from: "2026-10-26", to: "2026-12-06" });
    expect([grid.previous, grid.next]).toEqual(["2026-10", "2026-12"]);
  });

  it("starts on the 1st when the month starts on a Monday", () => {
    expect(monthGrid("2026-06").days[0]).toBe("2026-06-01");
  });

  it("crosses the year both ways", () => {
    expect(monthGrid("2027-01").previous).toBe("2026-12");
    expect(monthGrid("2026-12").next).toBe("2027-01");
  });
});
