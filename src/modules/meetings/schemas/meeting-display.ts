import { messages } from "@/lib/messages";

const M = messages.meetings;

/**
 * A meeting's times as the list shows them: "09:00–10:30", one time alone, or
 * nothing. Access saved "no time" as 00:00, so a 00:00–00:00 pair is no times.
 */
export function meetingTimes(start: string | null, end: string | null): string {
  if (start === "00:00" && end === "00:00") return "";
  if (start && end) return M.timeRange(start, end);
  if (end) return M.timeRange("", end);
  return start ?? "";
}

/** The list's date filters (?from=, ?to=) as dates; a malformed value is no filter. */
export function meetingDateFilter(raw: string | undefined): Date | null {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}
