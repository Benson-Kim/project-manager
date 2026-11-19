import { describe, expect, it } from "vitest";
import {
  fromMinutes,
  layoutDay,
  minutesToPx,
  moveSlot,
  plannerWindow,
  pxToMinutes,
  resizeSlot,
  shiftWindow,
  slotOf,
  slotText,
  snapMinutes,
  toMinutes,
  typedSlot,
} from "../planner";
import {
  createPlannerEntryInput,
  scheduleTodoItemInput,
  unscheduleTodoItemInput,
} from "../schemas/todo-schedule";
import { messages } from "@/lib/messages";

const t = messages.todoItems.planner;

describe("plannerWindow", () => {
  it("shows three days from ?days=", () => {
    expect(plannerWindow("2026-12-30", "2026-11-18")).toEqual({
      days: ["2026-12-30", "2026-12-31", "2027-01-01"],
      from: "2026-12-30",
      to: "2027-01-01",
    });
  });

  it("falls back to today for a missing or invalid value", () => {
    expect(plannerWindow(undefined, "2026-11-18").from).toBe("2026-11-18");
    expect(plannerWindow("2026-02-30", "2026-11-18").from).toBe("2026-11-18");
    expect(plannerWindow("tomorrow", "2026-11-18").from).toBe("2026-11-18");
  });

  it("moves by three days", () => {
    expect(shiftWindow("2026-11-18", 1)).toBe("2026-11-21");
    expect(shiftWindow("2026-03-01", -1)).toBe("2026-02-26");
  });
});

describe("minutes", () => {
  it("snaps to 15 minutes within the day", () => {
    expect(snapMinutes(487)).toBe(480);
    expect(snapMinutes(488)).toBe(495);
    expect(snapMinutes(-20)).toBe(0);
    expect(snapMinutes(1500)).toBe(1440);
  });

  it("maps wall clock to minutes and back, 1440 being the next midnight", () => {
    expect(toMinutes("2026-11-18T08:42", "2026-11-18")).toBe(522);
    expect(toMinutes("2026-11-19T00:00", "2026-11-18")).toBe(1440);
    expect(fromMinutes("2026-11-18", 522)).toBe("2026-11-18T08:42");
    expect(fromMinutes("2026-11-30", 1440)).toBe("2026-12-01T00:00");
  });

  it("maps minutes to pixels and back", () => {
    expect(pxToMinutes(minutesToPx(510))).toBe(510);
  });
});

describe("moveSlot and resizeSlot", () => {
  const exact = { start: "2026-11-18T08:30", end: "2026-11-18T08:42" };

  it("keeps the length and snaps the start", () => {
    expect(moveSlot(exact, "2026-11-20", 607)).toEqual({
      start: "2026-11-20T10:00",
      end: "2026-11-20T10:12",
    });
  });

  it("keeps a moved slot within the day", () => {
    const hour = { start: "2026-11-18T09:00", end: "2026-11-18T10:00" };
    expect(moveSlot(hour, "2026-11-18", 1430)).toEqual({
      start: "2026-11-18T23:00",
      end: "2026-11-19T00:00",
    });
  });

  it("snaps the end, at least one slot long and by midnight", () => {
    expect(resizeSlot(exact, 700).end).toBe("2026-11-18T11:45");
    expect(resizeSlot(exact, 400).end).toBe("2026-11-18T08:45");
    expect(resizeSlot(exact, 2000).end).toBe("2026-11-19T00:00");
  });
});

describe("typedSlot", () => {
  it("allows exact minutes and reads an end of 00:00 as midnight", () => {
    expect(typedSlot("2026-11-18", "08:30", "08:42")).toEqual({
      ...{ start: "2026-11-18T08:30", end: "2026-11-18T08:42" },
      problem: null,
    });
    expect(typedSlot("2026-11-18", "23:00", "00:00").end).toBe("2026-11-19T00:00");
    expect(typedSlot("2026-11-18", "15:00", "14:00").problem).toBe("order");
  });

  it("formats the marker text", () => {
    expect(slotText({ start: "2026-11-18T14:00", end: "2026-11-18T15:00" })).toBe(
      "2026-11-18 14:00-15:00",
    );
  });
});

describe("layoutDay", () => {
  const e = (id: number, start: string, end: string) => ({
    id,
    start: `2026-11-18T${start}`,
    end: start > end ? `2026-11-19T${end}` : `2026-11-18T${end}`,
  });

  it("puts overlapping entries side by side and leaves the others full width", () => {
    const placed = layoutDay(
      [
        e(1, "09:00", "10:00"),
        e(2, "09:30", "11:00"),
        e(3, "10:00", "10:30"),
        e(4, "12:00", "13:00"),
        { id: 5, start: "2026-11-19T09:00", end: "2026-11-19T10:00" },
      ],
      "2026-11-18",
    );
    const by = Object.fromEntries(placed.map((p) => [p.entry.id, [p.column, p.columns]]));
    expect(by).toEqual({ 1: [0, 2], 2: [1, 2], 3: [0, 2], 4: [0, 1] });
    expect(placed.find((p) => p.entry.id === 2)).toMatchObject({ top: 570, bottom: 660 });
  });

  it("places an entry ending at midnight", () => {
    expect(layoutDay([e(1, "23:00", "00:00")], "2026-11-18")[0].bottom).toBe(1440);
  });
});

describe("planner inputs", () => {
  const slot = { todoItemId: 7, start: "2026-11-18T14:00", end: "2026-11-18T15:00", rowVer: 3 };

  it("reject extra keys", () => {
    expect(scheduleTodoItemInput.safeParse({ ...slot, projectId: 1 }).success).toBe(false);
    expect(
      unscheduleTodoItemInput.safeParse({ todoItemId: 7, rowVer: 3, start: "x" }).success,
    ).toBe(false);
    expect(
      createPlannerEntryInput.safeParse({ title: "a", start: slot.start, end: slot.end, status: 1 })
        .success,
    ).toBe(false);
  });

  it("rejects 24:00 and accepts the next day's 00:00 as an end", () => {
    expect(scheduleTodoItemInput.safeParse({ ...slot, end: "2026-11-18T24:00" }).success).toBe(
      false,
    );
    expect(scheduleTodoItemInput.safeParse({ ...slot, end: "2026-11-19T00:00" }).success).toBe(
      true,
    );
  });

  it("reports order and midnight problems on end", () => {
    const order = scheduleTodoItemInput.safeParse({ ...slot, end: "2026-11-18T13:00" });
    const late = scheduleTodoItemInput.safeParse({ ...slot, end: "2026-11-19T00:15" });
    expect(order.error?.issues[0]).toMatchObject({ path: ["end"], message: t.order });
    expect(late.error?.issues[0]).toMatchObject({ path: ["end"], message: t.midnight });
  });

  it("creates a typed entry with a trimmed title", () => {
    const parsed = createPlannerEntryInput.parse({
      title: "  Meeting with Sam ",
      start: slot.start,
      end: slot.end,
    });
    expect(parsed.title).toBe("Meeting with Sam");
    expect(
      createPlannerEntryInput.safeParse({ title: " ", start: slot.start, end: slot.end }).success,
    ).toBe(false);
  });
});

describe("slotOf", () => {
  it("reads a placed to-do's wall-clock slot and its marker text", () => {
    const slot = slotOf(new Date("2026-11-19T08:30:00Z"), new Date("2026-11-19T08:42:00Z"));
    expect(slot).toEqual({ start: "2026-11-19T08:30", end: "2026-11-19T08:42" });
    expect(slotText(slot!)).toBe("2026-11-19 08:30-08:42");
  });

  it("is null for a to-do that is not on the planner", () => {
    expect(slotOf(null, null)).toBeNull();
    expect(slotOf(new Date("2026-11-19T08:30:00Z"), null)).toBeNull();
  });
});
