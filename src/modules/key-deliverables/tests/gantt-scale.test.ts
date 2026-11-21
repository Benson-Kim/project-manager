import { describe, expect, it } from "vitest";
import {
  barBox,
  dayCells,
  dayCentre,
  dayAt,
  defaultScale,
  groupRows,
  isGanttScale,
  makeTimeline,
  periodCells,
  todayLeft,
  xOf,
} from "../components/gantt-scale";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const today = d("2026-10-13");

describe("scales", () => {
  it("knows its three scales and nothing else", () => {
    expect(["day", "week", "month"].every(isGanttScale)).toBe(true);
    expect([undefined, "", "year", "Day", 1].some(isGanttScale)).toBe(false);
  });

  it("picks days up to three months, weeks up to a year, then months", () => {
    expect(defaultScale(d("2024-04-01"), d("2024-06-30"))).toBe("day");
    expect(defaultScale(d("2024-01-01"), d("2024-12-31"))).toBe("week");
    expect(defaultScale(d("2024-01-01"), d("2025-12-31"))).toBe("month");
    expect(defaultScale(null, null)).toBe("day");
  });
});

describe("makeTimeline", () => {
  it("shows whole months around the bars, with room after the last one for its dates", () => {
    const t = makeTimeline("day", { min: d("2024-04-16"), max: d("2024-05-31") }, today);
    expect(t.start).toEqual(d("2024-04-01"));
    expect(t.days).toBe(91);
    expect(t.width).toBe(91 * 32);
  });

  it("runs Monday to Sunday at the week scale", () => {
    const t = makeTimeline("week", { min: d("2024-05-10"), max: d("2024-05-20") }, today);
    expect(t.start).toEqual(d("2024-04-29"));
    expect(t.start.getUTCDay()).toBe(1);
    expect(t.days % 7).toBe(0);
    expect(t.days).toBe(63);
  });

  it("fits fifteen months in under a thousand pixels at the month scale", () => {
    const t = makeTimeline("month", { min: d("2024-04-16"), max: d("2025-02-10") }, today);
    expect(t.start).toEqual(d("2024-04-01"));
    expect(t.days).toBe(334);
    expect(t.width).toBe(668);
    const prototype = makeTimeline("month", { min: d("2026-01-05"), max: d("2027-02-20") }, today);
    expect(prototype.days).toBe(455);
    expect(prototype.width).toBeLessThan(1000);
  });

  it("shows the current month when nothing has dates", () => {
    const t = makeTimeline("day", { min: null, max: null }, today);
    expect(t.start).toEqual(d("2026-10-01"));
    expect(t.days).toBe(31);
  });
});

describe("geometry", () => {
  const t = makeTimeline("day", { min: d("2024-04-16"), max: d("2024-05-31") }, today);

  it("places a bar from its first day to the end of its last day", () => {
    expect(xOf(t, d("2024-04-16"))).toBe(15 * 32);
    expect(barBox(t, d("2024-04-16"), d("2024-04-19"))).toEqual({ left: 480, width: 128 });
  });

  it("keeps a one-day bar visible at the month scale", () => {
    const months = makeTimeline("month", { min: d("2024-04-16"), max: d("2024-05-31") }, today);
    expect(barBox(months, d("2024-04-16"), d("2024-04-16")).width).toBe(4);
  });

  it("finds the day under the pointer, for snapping to whole days", () => {
    expect(dayAt(t, 480)).toEqual(d("2024-04-16"));
    expect(dayAt(t, 511)).toEqual(d("2024-04-16"));
    expect(dayAt(t, 479)).toEqual(d("2024-04-15"));
  });
});

describe("periodCells", () => {
  it("splits week and month scales into quarters, cut at the timeline's ends", () => {
    const timeline = makeTimeline("week", { min: d("2026-02-10"), max: d("2026-08-01") }, today);
    const cells = periodCells(timeline);
    expect(cells.map((c) => c.label)).toEqual(["2026 Q1", "2026 Q2", "2026 Q3"]);
    expect(cells[0].left).toBe(0);
    expect(cells[1].left).toBe(xOf(timeline, d("2026-04-01")));
    const last = cells[cells.length - 1];
    expect(last.left + last.width).toBe(timeline.width);
  });

  it("names months at the day scale", () => {
    const timeline = makeTimeline("day", { min: d("2026-03-05"), max: d("2026-04-02") }, today);
    expect(periodCells(timeline).map((c) => c.label)).toEqual(["March 2026", "April 2026"]);
  });
});

describe("todayLeft", () => {
  it("puts the line in the middle of today, and nowhere outside the timeline", () => {
    const timeline = makeTimeline("day", { min: d("2026-10-01"), max: d("2026-10-20") }, today);
    expect(todayLeft(timeline, today)).toBe(dayCentre(timeline, today));
    expect(dayCentre(timeline, today)).toBe(xOf(timeline, today) + 16);
    expect(todayLeft(timeline, d("2025-01-01"))).toBeNull();
    expect(todayLeft(timeline, d("2030-01-01"))).toBeNull();
  });
});

describe("dayCells", () => {
  const labels = (scale: "day" | "week" | "month", min: string, max: string) =>
    dayCells(makeTimeline(scale, { min: d(min), max: d(max) }, today)).map((c) => c.label);

  it("labels every day at the day scale and names the month on its 1st", () => {
    const timeline = makeTimeline("day", { min: d("2026-12-30"), max: d("2027-01-02") }, today);
    const cells = dayCells(timeline);
    expect(cells).toHaveLength(62);
    expect(cells.slice(0, 3).map((c) => c.label)).toEqual(["1 Dec", "2", "3"]);
    expect(cells.slice(30, 33).map((c) => c.label)).toEqual(["31", "1 Jan", "2"]);
    expect(cells[31].left).toBe(xOf(timeline, d("2027-01-01")));
    expect(cells.every((c) => c.width === 32)).toBe(true);
  });

  it("labels each Monday at the week scale, naming the month on its first Monday", () => {
    expect(labels("week", "2026-02-10", "2026-08-01").slice(0, 3)).toEqual([
      "26 Jan",
      "2 Feb",
      "9",
    ]);
  });

  it("labels the 1st and 15th at the month scale", () => {
    expect(labels("month", "2026-01-10", "2026-03-01")).toEqual([
      "1 Jan",
      "15",
      "1 Feb",
      "15",
      "1 Mar",
      "15",
    ]);
  });

  it("covers the whole timeline", () => {
    const timeline = makeTimeline("week", { min: d("2026-02-10"), max: d("2026-08-01") }, today);
    const cells = dayCells(timeline);
    expect(cells[0].left).toBe(0);
    const last = cells[cells.length - 1];
    expect(last.left + last.width).toBe(timeline.width);
  });
});

describe("groupRows", () => {
  it("groups the days by month, quarter and year, cut at the timeline's ends", () => {
    const timeline = makeTimeline("day", { min: d("2026-12-30"), max: d("2027-01-02") }, today);
    const rows = groupRows(timeline);
    expect(rows.years.map((c) => c.label)).toEqual(["2026", "2027"]);
    expect(rows.quarters.map((c) => c.label)).toEqual(["Q4", "Q1"]);
    expect(rows.months.map((c) => c.label)).toEqual(["December", "January"]);
    expect(rows.years[0].left).toBe(0);
    expect(rows.years[1].left).toBe(xOf(timeline, d("2027-01-01")));
    expect(rows.years[1].left + rows.years[1].width).toBe(timeline.width);
  });

  it("shortens month names at the month scale", () => {
    const timeline = makeTimeline("month", { min: d("2026-01-10"), max: d("2026-03-01") }, today);
    expect(groupRows(timeline).months.map((c) => c.label)).toEqual(["Jan", "Feb", "Mar"]);
  });
});
