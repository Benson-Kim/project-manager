import { describe, expect, it } from "vitest";
import { bellLook } from "../bell-look";

describe("bellLook", () => {
  it("is an outline bell when nothing is listed", () => {
    expect(bellLook(0, 0)).toEqual({ state: "outline", ringing: false, count: 0 });
  });

  it("fills without turning red for upcoming alerts only", () => {
    expect(bellLook(3, 0)).toEqual({ state: "filled", ringing: false, count: 3 });
  });

  it("turns red while an alarm is due", () => {
    expect(bellLook(0, 1)).toEqual({ state: "filled", ringing: true, count: 1 });
    expect(bellLook(2, 1)).toEqual({ state: "filled", ringing: true, count: 3 });
  });
});
