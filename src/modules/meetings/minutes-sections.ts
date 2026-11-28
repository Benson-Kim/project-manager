import { z } from "zod";

/**
 * The built-in minutes sections a user may rename. The list matches the
 * CHECK on app.MeetingMinutesSection.SectionKey and the proc that saves it;
 * a guardrail test keeps the three in step.
 */
export const MINUTES_SECTION_KEYS = ["CarryOver", "Agenda", "Summary", "Conclusion"] as const;

export const minutesSectionKeySchema = z.enum(MINUTES_SECTION_KEYS);
export type MinutesSectionKey = z.infer<typeof minutesSectionKeySchema>;

export const MINUTES_SECTION_TITLE_MAX = 200;
export const MINUTES_SECTION_BODY_MAX = 50_000;

/** The title a meeting gave a built-in section, or its default. */
export function sectionTitle(
  sections: readonly { SectionKey: string | null; Title: string }[],
  key: MinutesSectionKey,
  fallback: string,
): string {
  return sections.find((section) => section.SectionKey === key)?.Title ?? fallback;
}
