import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MINUTES_SECTION_KEYS } from "@/modules/meetings/minutes-sections";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const keysIn = (list: string) => [...list.matchAll(/N'(\w+)'/g)].map((m) => m[1]).sort();

describe("minutes section keys stay in step", () => {
  const registry = [...MINUTES_SECTION_KEYS].sort();

  it("matches the CHECK on app.MeetingMinutesSection", () => {
    const check = /CHECK \(SectionKey IN \(([^)]*)\)\)/.exec(
      read("db/migrations/087_meeting_minutes_sections.sql"),
    );
    expect(check).not.toBeNull();
    expect(keysIn(check![1])).toEqual(registry);
  });

  it("matches the list the save proc accepts", () => {
    const list = /@SectionKey NOT IN \(([^)]*)\)/.exec(
      read("db/procs/meeting-minutes-section/usp_MeetingMinutesSection_Save.sql"),
    );
    expect(list).not.toBeNull();
    expect(keysIn(list![1])).toEqual(registry);
  });
});
