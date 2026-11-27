interface KeyLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
}

/** Ctrl+S (Cmd+S on a Mac) saves the work on the page. */
export function isSaveShortcut(event: KeyLike): boolean {
  if (event.defaultPrevented || event.altKey || event.shiftKey) return false;
  return (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s";
}

export const DIALOG = '[role="dialog"], [role="alertdialog"], dialog[open]';

/** Work lives in the page's main area or an open dialog, never in the app's own menus (Sign out), and a search is not work. */
export function isWorkForm(form: Pick<Element, "closest" | "matches">): boolean {
  return form.closest(`main, ${DIALOG}`) !== null && !form.matches('[role="search"]');
}

/** Where the user is working: the form around them, the open dialogs (top last), and the page's own forms. */
export interface SaveCandidates<F> {
  around: F | null;
  dialogs: F[][];
  page: F[];
}

/**
 * The form a save is meant for: the one the user is in, else the top dialog's only form, else the
 * page's only form. Null when it is not clear which, or a dialog without one covers the page.
 */
export function formToSave<F>(c: SaveCandidates<F>): F | null {
  if (c.around) return c.around;
  const top = c.dialogs.at(-1);
  if (top) return top.length === 1 ? top[0] : null;
  return c.page.length === 1 ? c.page[0] : null;
}
