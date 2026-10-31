import { describe, expect, it } from "vitest";
import { MOSCOW_TONES, nextMoscow, TYPE_TONES } from "../components/requirement-chips";
import { MOSCOW } from "../schemas/moscow";
import { REQUIREMENT_TYPES } from "../schemas/requirement-types";

describe("requirement chip colours", () => {
  it("gives every requirement kind its agreed colour", () => {
    expect(Object.keys(TYPE_TONES).sort()).toEqual([...REQUIREMENT_TYPES].sort());
    expect(TYPE_TONES).toEqual({
      FR: "blue",
      NFR: "yellow",
      TR: "purple",
      BR: "gray",
      SR: "green",
    });
  });

  it("gives every MoSCoW code its agreed colour", () => {
    expect(Object.keys(MOSCOW_TONES)).toEqual([...MOSCOW]);
    expect(MOSCOW_TONES).toEqual({ M: "red", S: "yellow", C: "green", W: "gray" });
  });
});

describe("nextMoscow", () => {
  it("sets the chosen code", () => {
    expect(nextMoscow(null, "M")).toBe("M");
    expect(nextMoscow("S", "C")).toBe("C");
  });

  it("clears when the code already set is chosen again", () => {
    expect(nextMoscow("W", "W")).toBeNull();
  });
});
