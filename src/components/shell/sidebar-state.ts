/**
 * The desktop sidebar is expanded (icons and names) or collapsed to an icon rail.
 * The choice is per viewer, kept in localStorage("sidebar"), and lives on
 * html[data-sidebar] so CSS (the `rail:` variant) draws it: the pre-paint script
 * sets the attribute before first paint, so a collapsed sidebar never jumps.
 */
export type SidebarState = "expanded" | "collapsed";

const KEY = "sidebar";
const ATTRIBUTE = "data-sidebar";

export function sidebarStateOf(stored: string | null | undefined): SidebarState {
  return stored === "collapsed" ? "collapsed" : "expanded";
}

/** Pre-paint script source, run with the theme script (see theme-script.tsx). */
export const sidebarInitScript = `(function(){try{document.documentElement.setAttribute("${ATTRIBUTE}",localStorage.getItem("${KEY}")==="collapsed"?"collapsed":"expanded");}catch(e){}})();`;

export function shownSidebar(): SidebarState {
  return sidebarStateOf(document.documentElement.getAttribute(ATTRIBUTE));
}

export function isSidebarApplied(): boolean {
  return document.documentElement.hasAttribute(ATTRIBUTE);
}

export function storedSidebar(): SidebarState {
  try {
    return sidebarStateOf(window.localStorage.getItem(KEY));
  } catch {
    return "expanded";
  }
}

export function applySidebar(state: SidebarState) {
  document.documentElement.setAttribute(ATTRIBUTE, state);
}

export function saveSidebar(state: SidebarState) {
  try {
    if (state === "collapsed") window.localStorage.setItem(KEY, state);
    else window.localStorage.removeItem(KEY);
  } catch {
    // Storage blocked (private window, policy): the choice lasts until reload.
  }
}

export function isSidebarKey(key: string | null): boolean {
  return key === KEY;
}
