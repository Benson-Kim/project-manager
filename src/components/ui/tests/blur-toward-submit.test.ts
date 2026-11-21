import { describe, expect, it } from "vitest";
import { blursTowardSubmit } from "../form/blur-toward-submit";

const form = {} as HTMLFormElement;
const otherForm = {} as HTMLFormElement;

function control(type: string, owner: HTMLFormElement | null) {
  return { type, form: owner } as unknown as EventTarget;
}

describe("blursTowardSubmit", () => {
  it("is true when focus moves to this form's submit button", () => {
    expect(blursTowardSubmit(form, control("submit", form))).toBe(true);
  });

  it("is false for another form's submit button", () => {
    expect(blursTowardSubmit(form, control("submit", otherForm))).toBe(false);
  });

  it("is false for plain buttons and fields", () => {
    expect(blursTowardSubmit(form, control("button", form))).toBe(false);
    expect(blursTowardSubmit(form, control("text", form))).toBe(false);
  });

  it("is false when focus leaves the page or goes nowhere", () => {
    expect(blursTowardSubmit(form, null)).toBe(false);
  });
});
