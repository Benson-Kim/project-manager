import { describe, expect, it } from "vitest";
import {
  defaultCalendarForm,
  findConflict,
  slotFromForm,
  slotsOverlap,
} from "../schemas/calendar-slot";

const slot = (start: string, end: string) => ({
  start: `2026-11-25T${start}`,
  end: `2026-11-25T${end}`,
});

describe("slotsOverlap", () => {
  it("sees a clash when the times cross", () => {
    expect(slotsOverlap(slot("13:00", "14:30"), slot("14:00", "15:00"))).toBe(true);
    expect(slotsOverlap(slot("13:00", "14:30"), slot("12:00", "16:00"))).toBe(true);
  });

  it("lets slots that only touch sit side by side", () => {
    expect(slotsOverlap(slot("13:00", "14:00"), slot("14:00", "15:00"))).toBe(false);
    expect(slotsOverlap(slot("15:00", "16:00"), slot("13:00", "14:00"))).toBe(false);
  });
});

describe("findConflict", () => {
  const others = [
    { todoItemId: 7, title: "Own slot", ...slot("13:00", "14:00") },
    { todoItemId: 8, title: "Site visit", ...slot("13:30", "15:00") },
  ];

  it("names the first other to-do in the way", () => {
    expect(findConflict(slot("13:00", "14:00"), others, 7)?.title).toBe("Site visit");
  });

  it("never counts the to-do against itself", () => {
    expect(findConflict(slot("13:00", "13:30"), others, 7)).toBeNull();
  });
});

describe("slotFromForm", () => {
  it("joins the day and both times", () => {
    expect(slotFromForm({ day: "2026-11-25", startTime: "13:00", endTime: "14:30" })).toEqual(
      slot("13:00", "14:30"),
    );
  });

  it("reads an end of 00:00 as the midnight that closes the day", () => {
    expect(slotFromForm({ day: "2026-11-25", startTime: "23:00", endTime: "00:00" }).end).toBe(
      "2026-11-26T00:00",
    );
  });
});

describe("defaultCalendarForm", () => {
  const none = { start: null, end: null, startDate: null, dueDate: null };

  it("opens on the slot already booked", () => {
    expect(
      defaultCalendarForm(
        { ...none, start: "2026-11-30T09:15", end: "2026-11-30T10:00" },
        "2026-11-25T08:10:00",
      ),
    ).toEqual({ day: "2026-11-30", startTime: "09:15", endTime: "10:00" });
  });

  it("uses the to-do's own date when it is not past, for an hour from the next whole hour", () => {
    expect(
      defaultCalendarForm({ ...none, startDate: "2026-11-28" }, "2026-11-25T08:10:00"),
    ).toEqual({
      day: "2026-11-28",
      startTime: "09:00",
      endTime: "10:00",
    });
    expect(
      defaultCalendarForm(
        { ...none, startDate: "2026-11-20", dueDate: "2026-11-27" },
        "2026-11-25T08:10:00",
      ).day,
    ).toBe("2026-11-27");
  });

  it("falls back to today when the to-do's dates are past or empty", () => {
    expect(defaultCalendarForm({ ...none, dueDate: "2026-11-01" }, "2026-11-25T08:10:00").day).toBe(
      "2026-11-25",
    );
    expect(defaultCalendarForm(none, "2026-11-25T22:40:00")).toEqual({
      day: "2026-11-25",
      startTime: "23:00",
      endTime: "00:00",
    });
  });

  it("rolls past 23:00 to the next day", () => {
    expect(defaultCalendarForm(none, "2026-11-25T23:05:00")).toEqual({
      day: "2026-11-26",
      startTime: "00:00",
      endTime: "01:00",
    });
  });
});
