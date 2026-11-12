import { describe, expect, it } from "vitest";
import { historyKeyOf, type HistoryKeyEvent } from "../schemas/responsibility-history-keys";

const press = (key: string, more: Partial<HistoryKeyEvent> = {}): HistoryKeyEvent => ({
  key,
  ctrlKey: true,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  target: { tagName: "SELECT" },
  ...more,
});

describe("historyKeyOf", () => {
  it("reads Ctrl+Z as undo and Ctrl+Y or Ctrl+Shift+Z as redo, Cmd too", () => {
    expect(historyKeyOf(press("z"))).toBe("undo");
    expect(historyKeyOf(press("y"))).toBe("redo");
    expect(historyKeyOf(press("Z", { shiftKey: true }))).toBe("redo");
    expect(historyKeyOf(press("z", { ctrlKey: false, metaKey: true }))).toBe("undo");
  });

  it("works from a role select or a button", () => {
    expect(historyKeyOf(press("z", { target: { tagName: "BUTTON" } }))).toBe("undo");
    expect(historyKeyOf(press("z", { target: null }))).toBe("undo");
  });

  it("leaves text fields their own undo", () => {
    expect(historyKeyOf(press("z", { target: { tagName: "INPUT" } }))).toBeNull();
    expect(historyKeyOf(press("y", { target: { tagName: "textarea" } }))).toBeNull();
    expect(historyKeyOf(press("z", { target: { isContentEditable: true } }))).toBeNull();
  });

  it("ignores other keys and modifiers", () => {
    expect(historyKeyOf(press("z", { ctrlKey: false }))).toBeNull();
    expect(historyKeyOf(press("z", { altKey: true }))).toBeNull();
    expect(historyKeyOf(press("x"))).toBeNull();
  });
});
