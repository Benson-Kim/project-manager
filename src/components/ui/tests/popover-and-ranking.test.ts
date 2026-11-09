import { describe, expect, it } from "vitest";
import { matchesNone, matchRank, NO_MATCH, rankByMatch } from "../form/rank-options";
import { opensUp, panelLeft, panelTop, roomFor } from "../popover-placement";

describe("rankByMatch", () => {
  const names = ["Mike Armstrong", "Suganthi", "Armand", "Karma", "Sarah Jenkins"];
  const ranked = (q: string) => rankByMatch(names, q, (n) => n).map((r) => r.option);

  it("keeps every option, best match first", () => {
    expect(ranked("arm")).toEqual([
      "Armand",
      "Mike Armstrong",
      "Karma",
      "Suganthi",
      "Sarah Jenkins",
    ]);
  });

  it("keeps the given order when nothing is typed or nothing matches", () => {
    expect(ranked("")).toEqual(names);
    expect(ranked("zzz")).toEqual(names);
  });

  it("ranks whole, start, word start, inside, none", () => {
    expect(matchRank("Armand", "armand")).toBe(0);
    expect(matchRank("Armand", "ARM")).toBe(1);
    expect(matchRank("Mike Armstrong", "arm")).toBe(2);
    expect(matchRank("Karma", "arm")).toBe(3);
    expect(matchRank("Suganthi", "arm")).toBe(NO_MATCH);
  });
});

describe("matchesNone", () => {
  const people = ["Jane Test1", "Alex Rivera"];
  const label = (s: string) => s;

  it("is true for typed text no option contains", () => {
    expect(matchesNone(people, "Marcus Chen", label)).toBe(true);
  });

  it("is true when there are no options to match", () => {
    expect(matchesNone([], "Jane", label)).toBe(true);
  });

  it("is false while any option contains the text, whatever its case or spacing", () => {
    expect(matchesNone(people, "  rivera ", label)).toBe(false);
    expect(matchesNone(people, "JANE", label)).toBe(false);
  });

  it("is false for blank text", () => {
    expect(matchesNone(people, "", label)).toBe(false);
    expect(matchesNone(people, "   ", label)).toBe(false);
  });
});

describe("popover placement", () => {
  const bounds = { top: 0, bottom: 800 };

  it("opens down when the panel fits below", () => {
    expect(opensUp({ top: 100, bottom: 140 }, 240, bounds)).toBe(false);
  });

  it("opens up when it would be cut off below and there is more room above", () => {
    expect(opensUp({ top: 700, bottom: 740 }, 240, bounds)).toBe(true);
  });

  it("stays down when above has even less room", () => {
    expect(opensUp({ top: 60, bottom: 100 }, 900, bounds)).toBe(false);
  });

  it("caps the panel to the room on its side", () => {
    expect(roomFor(true, { top: 700, bottom: 740 }, bounds)).toBe(692);
    expect(roomFor(false, { top: 700, bottom: 740 }, bounds)).toBe(96);
  });

  it("sits just under its anchor, or just above it when it opens up", () => {
    expect(panelTop({ top: 100, bottom: 140 }, 240, false)).toBe(144);
    expect(panelTop({ top: 700, bottom: 740 }, 240, true)).toBe(456);
  });

  it("lines up with the anchor's left or right edge, inside the window", () => {
    const anchor = { left: 300, right: 340 };
    expect(panelLeft(anchor, 200, "start", 1440)).toBe(300);
    expect(panelLeft(anchor, 200, "stretch", 1440)).toBe(300);
    expect(panelLeft(anchor, 200, "end", 1440)).toBe(140);
    expect(panelLeft({ left: 20, right: 60 }, 200, "end", 360)).toBe(8);
    expect(panelLeft({ left: 300, right: 340 }, 200, "start", 360)).toBe(152);
  });
});
