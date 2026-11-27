import type { MenuItemConstructorOptions } from "electron";

export interface ContextMenuPageExtras {
  canAddNote: boolean;
  canAddLink: boolean;
  canCompleteLink: boolean;
  pendingLabel?: string | null;
}

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
  /** The page is one of the app's own, so it can be printed or saved. */
  appPage: boolean;
  /** Semantic page-level sticky notes and 1-to-1 cross-link menu items on non-editable app regions. */
  pageExtras?: ContextMenuPageExtras | null;
}

export interface ContextMenuActions {
  replaceMisspelling(word: string): void;
  addToDictionary(word: string): void;
  copyLink(): void;
  setChecking(on: boolean): void;
  saveWork(): void;
  printPage(): void;
  savePageAsPdf(): void;
  addPageNote?(): void;
  addCrossLink?(): void;
  completeCrossLink?(): void;
}

const MAX_SPELLINGS = 5;

/** The right-click menu: spelling, grammar, editing, Save on the app's pages, then the switch for checking; off a field, printing and saving the page. */
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
  if (s.appPage) {
    groups.push([
      {
        label: "Save",
        accelerator: "CommandOrControl+S",
        registerAccelerator: false,
        click: a.saveWork,
      },
    ]);
  }
  if (!s.isEditable && s.appPage) {
    const extras = s.pageExtras;
    const extraItems: MenuItemConstructorOptions[] = [];
    if (extras?.canAddLink && a.addCrossLink) {
      extraItems.push({ label: "Add cross-link here…", click: () => a.addCrossLink?.() });
    }
    if (extras?.canCompleteLink && a.completeCrossLink) {
      const cleanLabel = extras.pendingLabel?.trim().slice(0, 40).replace(/&/g, "&&");
      extraItems.push({
        label: cleanLabel ? `Complete cross-link with “${cleanLabel}”` : "Complete cross-link…",
        click: () => a.completeCrossLink?.(),
      });
    }
    if (extras?.canAddNote && a.addPageNote) {
      extraItems.push({ label: "Add page note…", click: () => a.addPageNote?.() });
    }
    if (extraItems.length > 0) groups.push(extraItems);

    groups.push([
      { label: "Print…", click: a.printPage },
      { label: "Save page as PDF…", click: a.savePageAsPdf },
    ]);
  }
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
