import { describe, expect, it } from "vitest";
import { matchRank, NO_MATCH, rankByMatch } from "../form/rank-options";
import { opensUp, roomFor } from "../popover-placement";

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
});
