import { describe, expect, it } from "vitest";
import { formToSave, isSaveShortcut, isWorkForm } from "../save-work";

const key = (
  k: string,
  mods: Partial<Record<"ctrlKey" | "metaKey" | "shiftKey" | "altKey", boolean>> = {},
) => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  defaultPrevented: false,
  ...mods,
});

describe("isSaveShortcut", () => {
  it("takes Ctrl+S and Cmd+S, not other keys or chords", () => {
    expect(isSaveShortcut(key("s", { ctrlKey: true }))).toBe(true);
    expect(isSaveShortcut(key("S", { metaKey: true }))).toBe(true);
    expect(isSaveShortcut(key("s"))).toBe(false);
    expect(isSaveShortcut(key("s", { ctrlKey: true, shiftKey: true }))).toBe(false);
    expect(isSaveShortcut({ ...key("s", { ctrlKey: true }), defaultPrevented: true })).toBe(false);
  });
});

describe("formToSave", () => {
  it("saves the form the user is in first", () => {
    expect(formToSave({ around: "notes", dialogs: [["dialog"]], page: ["a", "b"] })).toBe("notes");
  });

  it("saves the top dialog's form, and never the page behind a dialog", () => {
    expect(formToSave({ around: null, dialogs: [["first"], ["top"]], page: ["page"] })).toBe("top");
    expect(formToSave({ around: null, dialogs: [[]], page: ["page"] })).toBeNull();
  });

  it("saves the page's only form, and none when it is not clear which", () => {
    expect(formToSave({ around: null, dialogs: [], page: ["only"] })).toBe("only");
    expect(formToSave({ around: null, dialogs: [], page: ["a", "b"] })).toBeNull();
  });
});

describe("isWorkForm", () => {
  const formIn = (ancestors: string[], self = "form") =>
    ({
      closest: (sel: string) =>
        sel.split(",").some((s) => ancestors.includes(s.trim())) ? self : null,
      matches: (sel: string) => sel === self,
    }) as unknown as Element;

  it("never takes Sign out in the sidebar or the account menu, so a save on the dashboard cannot sign out", () => {
    expect(isWorkForm(formIn(["nav"]))).toBe(false);
    expect(isWorkForm(formIn(['[role="menu"]']))).toBe(false);
  });

  it("takes forms in the main area and in open dialogs, but not a search", () => {
    expect(isWorkForm(formIn(["main"]))).toBe(true);
    expect(isWorkForm(formIn(['[role="dialog"]']))).toBe(true);
    expect(isWorkForm(formIn(["main"], '[role="search"]'))).toBe(false);
  });
});
