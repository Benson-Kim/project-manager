import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeAfterBlur } from "../form/close-after-blur";

function fieldIn(doc: { activeElement: unknown }): HTMLElement {
  return { ownerDocument: doc } as unknown as HTMLElement;
}

describe("closeAfterBlur", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("closes once the blur has settled and the focus is elsewhere", () => {
    const close = vi.fn();
    closeAfterBlur(fieldIn({ activeElement: null }), close);
    vi.advanceTimersByTime(99);
    expect(close).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(close).toHaveBeenCalledOnce();
  });

  it("stays open when the field has the focus back before the blur settles", () => {
    const doc: { activeElement: unknown } = { activeElement: null };
    const field = fieldIn(doc);
    const close = vi.fn();
    closeAfterBlur(field, close);
    doc.activeElement = field;
    vi.runAllTimers();
    expect(close).not.toHaveBeenCalled();
  });
});
