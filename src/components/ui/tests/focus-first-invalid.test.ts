import { describe, expect, it, vi } from "vitest";
import { focusFirstInvalid } from "../form/focus-first-invalid";

function fakeRoot(target: HTMLElement | null) {
  const querySelector = vi.fn(() => target);
  return { root: { querySelector } as unknown as ParentNode, querySelector };
}

function fakeField() {
  const scrollIntoView = vi.fn();
  const focus = vi.fn();
  return { field: { scrollIntoView, focus } as unknown as HTMLElement, scrollIntoView, focus };
}

describe("focusFirstInvalid", () => {
  it("scrolls to the first invalid control and focuses it without a second scroll", () => {
    const { field, scrollIntoView, focus } = fakeField();
    const { root, querySelector } = fakeRoot(field);

    expect(focusFirstInvalid(root)).toBe(true);
    expect(querySelector).toHaveBeenCalledWith('[aria-invalid="true"], [data-invalid]');
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "center" });
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it("returns false when nothing is invalid", () => {
    expect(focusFirstInvalid(fakeRoot(null).root)).toBe(false);
  });

  it("returns false without a root", () => {
    expect(focusFirstInvalid(null)).toBe(false);
    expect(focusFirstInvalid(undefined)).toBe(false);
  });
});
