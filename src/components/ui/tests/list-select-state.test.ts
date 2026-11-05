import { describe, expect, it } from "vitest";
import { shownOption } from "../form/list-select-state";
import { EDIT_LIST } from "../lookup-lists";

const options = [
  { value: "", defaultSelected: false },
  { value: "Not started", defaultSelected: false },
  { value: "In progress", defaultSelected: true },
  { value: EDIT_LIST, defaultSelected: false },
];

describe("the option a list select returns to after Edit list…", () => {
  it("is the one it shows", () => {
    expect(shownOption({ value: "Not started", options })).toBe("Not started");
  });

  it("is its default when Edit list… was picked before the page came alive", () => {
    expect(shownOption({ value: EDIT_LIST, options })).toBe("In progress");
  });

  it("is the empty option when it has no default", () => {
    const none = options.map((o) => ({ ...o, defaultSelected: false }));
    expect(shownOption({ value: EDIT_LIST, options: none })).toBe("");
  });
});
