import type { MenuItemConstructorOptions } from "electron";

export interface ContextMenuState {
  isEditable: boolean;
  /** The field asks to be checked (password, link and sign-in fields do not). */
  checkable: boolean;
  hasSelection: boolean;
  linkURL: string;
  misspelledWord: string;
  dictionarySuggestions: string[];
  editFlags: { canCut: boolean; canCopy: boolean; canPaste: boolean; canSelectAll: boolean };
  checking: boolean;
  /** Fixes for the paragraph, or "loading" while the grammar checker starts. */
  grammar: { label: string; apply(): void }[] | "loading";
}

export interface ContextMenuActions {
  replaceMisspelling(word: string): void;
  addToDictionary(word: string): void;
  copyLink(): void;
  setChecking(on: boolean): void;
}

const MAX_SPELLINGS = 5;

/** The right-click menu: spelling, grammar, editing, then the switch for checking. */
export function contextMenuTemplate(
  s: ContextMenuState,
  a: ContextMenuActions,
): MenuItemConstructorOptions[] {
  const groups: MenuItemConstructorOptions[][] = [];
  if (s.isEditable && s.misspelledWord) {
    const spellings = s.dictionarySuggestions.slice(0, MAX_SPELLINGS);
    groups.push([
      ...(spellings.length
        ? spellings.map((word) => ({ label: word, click: () => a.replaceMisspelling(word) }))
        : [{ label: "No suggestions", enabled: false }]),
      { label: "Add to dictionary", click: () => a.addToDictionary(s.misspelledWord) },
    ]);
  }
  if (s.isEditable && s.checkable && s.checking) {
    if (s.grammar === "loading")
      groups.push([{ label: "Grammar check is loading…", enabled: false }]);
    else if (s.grammar.length)
      groups.push(s.grammar.map((fix) => ({ label: fix.label, click: fix.apply })));
  }
  if (s.isEditable) {
    groups.push([
      { role: "cut", enabled: s.editFlags.canCut },
      { role: "copy", enabled: s.editFlags.canCopy },
      { role: "paste", enabled: s.editFlags.canPaste },
      { type: "separator" },
      { role: "selectAll", enabled: s.editFlags.canSelectAll },
    ]);
  } else if (s.hasSelection) {
    groups.push([{ role: "copy" }]);
  }
  if (s.linkURL) groups.push([{ label: "Copy link", click: a.copyLink }]);
  if (s.isEditable && s.checkable) {
    groups.push([
      {
        label: "Check spelling and grammar",
        type: "checkbox",
        checked: s.checking,
        click: () => a.setChecking(!s.checking),
      },
    ]);
  }
  return groups.flatMap((group, i) =>
    i ? [{ type: "separator" } satisfies MenuItemConstructorOptions, ...group] : group,
  );
}
