import { describe, expect, it } from "vitest";
import { namesAPick, unpickedOptions, withoutPick, withPick } from "../stakeholder-picks";

const ada = { stakeholderId: 1, name: "Ada Lovelace" };
const alan = { stakeholderId: 2, name: "Alan Turing" };
const grace = { stakeholderId: 3, name: "Grace Hopper" };
const options = [ada, alan, grace];

describe("stakeholder picks", () => {
  it("offers only the stakeholders not picked yet, in the list's order", () => {
    expect(unpickedOptions(options, [])).toEqual(options);
    expect(unpickedOptions(options, [{ id: 2, name: "Alan Turing" }])).toEqual([ada, grace]);
    expect(
      unpickedOptions(options, [
        { id: 1, name: "Ada Lovelace" },
        { id: 2, name: "Alan Turing" },
        { id: 3, name: "Grace Hopper" },
      ]),
    ).toEqual([]);
  });

  it("adds several picks in the order they were chosen, each once", () => {
    let picked = withPick([], grace);
    picked = withPick(picked, ada);
    picked = withPick(picked, alan);
    expect(picked).toEqual([
      { id: 3, name: "Grace Hopper" },
      { id: 1, name: "Ada Lovelace" },
      { id: 2, name: "Alan Turing" },
    ]);
    expect(withPick(picked, ada)).toEqual(picked);
  });

  it("never changes the picks it was given", () => {
    const picked = [{ id: 1, name: "Ada Lovelace" }];
    withPick(picked, alan);
    withoutPick(picked, 1);
    expect(picked).toEqual([{ id: 1, name: "Ada Lovelace" }]);
    expect(withPick(picked, ada)).not.toBe(picked);
  });

  it("removes one pick and keeps the rest in order", () => {
    const picked = [
      { id: 3, name: "Grace Hopper" },
      { id: 1, name: "Ada Lovelace" },
      { id: 2, name: "Alan Turing" },
    ];
    expect(withoutPick(picked, 1)).toEqual([
      { id: 3, name: "Grace Hopper" },
      { id: 2, name: "Alan Turing" },
    ]);
    expect(withoutPick(picked, 99)).toEqual(picked);
  });

  it("knows typed text that names someone already picked", () => {
    const picked = [{ id: 1, name: "Ada Lovelace" }];
    expect(namesAPick(picked, "lovelace")).toBe(true);
    expect(namesAPick(picked, "  Ada ")).toBe(true);
    expect(namesAPick(picked, "Turing")).toBe(false);
    expect(namesAPick(picked, "   ")).toBe(false);
    expect(namesAPick([], "Ada")).toBe(false);
  });
});
