import { describe, expect, it } from "vitest";
import { historyShortcut } from "../shortcut";

const body = { tagName: "DIV", closest: () => null };
const press = (key: string, extra: Record<string, unknown> = {}) => ({
  key,
  ctrlKey: true,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  defaultPrevented: false,
  target: body as unknown as EventTarget,
  ...extra,
});

describe("page undo shortcuts", () => {
  it("reads Ctrl+Z as Undo and Ctrl+Y or Ctrl+Shift+Z as Redo, Cmd too", () => {
    expect(historyShortcut(press("z"))).toBe("undo");
    expect(historyShortcut(press("y"))).toBe("redo");
    expect(historyShortcut(press("Z", { shiftKey: true }))).toBe("redo");
    expect(historyShortcut(press("z", { ctrlKey: false, metaKey: true }))).toBe("undo");
  });

  it("leaves the keys to text boxes, rich-text editors and dialogs", () => {
    for (const tagName of ["INPUT", "TEXTAREA", "SELECT"]) {
      expect(historyShortcut(press("z", { target: { tagName } }))).toBeNull();
    }
    expect(
      historyShortcut(press("z", { target: { tagName: "DIV", isContentEditable: true } })),
    ).toBeNull();
    expect(
      historyShortcut(press("z", { target: { tagName: "BUTTON", closest: () => ({}) } })),
    ).toBeNull();
  });

  it("leaves the keys to an editor with its own history that already took them", () => {
    expect(historyShortcut(press("z", { defaultPrevented: true }))).toBeNull();
  });

  it("ignores other keys and Alt chords", () => {
    expect(historyShortcut(press("x"))).toBeNull();
    expect(historyShortcut(press("z", { altKey: true }))).toBeNull();
    expect(historyShortcut(press("z", { ctrlKey: false }))).toBeNull();
    expect(historyShortcut(press("y", { shiftKey: true }))).toBeNull();
  });
});
