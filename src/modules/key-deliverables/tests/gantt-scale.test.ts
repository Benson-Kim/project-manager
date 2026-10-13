import { describe, expect, it } from "vitest";
import {
  barBox,
  dayAt,
  defaultScale,
  headerRows,
  isGanttScale,
  makeTimeline,
  shortDate,
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

  it("fits a year in about a thousand pixels at the month scale", () => {
    const t = makeTimeline("month", { min: d("2024-04-16"), max: d("2025-02-10") }, today);
    expect(t.start).toEqual(d("2024-04-01"));
    expect(t.days).toBe(365);
    expect(t.width).toBe(1095);
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

describe("headerRows: the dates stay visible at every scale", () => {
  it("day: month and year over each day's number, weekends marked", () => {
    const { top, bottom } = headerRows(
      makeTimeline("day", { min: d("2024-04-16"), max: d("2024-05-31") }, today),
    );
    expect(top.map((c) => [c.label, c.left, c.width])).toEqual([
      ["April 2024", 0, 960],
      ["May 2024", 960, 992],
      ["June 2024", 1952, 960],
    ]);
    expect(bottom).toHaveLength(91);
    expect(bottom.slice(0, 7).map((c) => [c.label, c.weekend])).toEqual([
      ["1", false],
      ["2", false],
      ["3", false],
      ["4", false],
      ["5", false],
      ["6", true],
      ["7", true],
    ]);
  });

  it("week: month and year over the date of each Monday", () => {
    const { top, bottom } = headerRows(
      makeTimeline("week", { min: d("2024-05-10"), max: d("2024-05-20") }, today),
    );
    expect(top.map((c) => [c.label, c.left, c.width])).toEqual([
      ["Apr 2024", 0, 24],
      ["May 2024", 24, 372],
      ["Jun 2024", 396, 360],
    ]);
    expect(bottom.map((c) => c.label)).toEqual([
      "29",
      "6",
      "13",
      "20",
      "27",
      "3",
      "10",
      "17",
      "24",
    ]);
    expect(bottom[1]).toMatchObject({ left: 84, width: 84 });
  });

  it("month: the year over each month's name", () => {
    const { top, bottom } = headerRows(
      makeTimeline("month", { min: d("2024-11-16"), max: d("2025-01-10") }, today),
    );
    expect(top.map((c) => c.label)).toEqual(["2024", "2025"]);
    expect(top[0]).toMatchObject({ left: 0, width: 61 * 3 });
    expect(bottom.map((c) => c.label)).toEqual(["Nov", "Dec", "Jan", "Feb"]);
  });

  it("labels a bar's dates short", () => {
    expect(shortDate(d("2024-04-16"))).toBe("Apr 16");
  });
});
