/** Month names for the fiscal-year start pickers, in the page language. */
export const MONTHS = Array.from({ length: 12 }, (_, i) =>
  new Intl.DateTimeFormat("en-CA", { month: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(2000, i, 1)),
  ),
);
