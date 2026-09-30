/**
 * Pure decision logic for the unsaved-changes guard , ADR-0018 Q1):
 * `beforeunload` only covers full unloads, so client-side <Link> navigation
 * (section nav, sidebar, breadcrumb) is intercepted at the document capture
 * phase. This module decides whether a click must be intercepted; kept free of
 * DOM types so it is unit-testable in the node environment.
 */
export interface GuardClickLike {
  defaultPrevented: boolean;
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

export interface GuardAnchorLike {
  /** Absolute href as resolved by the DOM (HTMLAnchorElement.href). */
  href: string;
  target: string;
  hasAttribute(name: string): boolean;
}

/**
 * Returns the in-app href a guarded click navigates to, or null when the
 * click must not be intercepted (modified clicks, new-tab targets, downloads,
 * external origins — those either open elsewhere or hit `beforeunload` —
 * and same-page/hash-only navigation).
 */
export function guardedHref(
  event: GuardClickLike,
  anchor: GuardAnchorLike | null,
  currentUrl: string,
): string | null {
  if (!anchor || event.defaultPrevented) return null;
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return null;
  }
  if (anchor.target && anchor.target !== "_self") return null;
  if (anchor.hasAttribute("download")) return null;
  const current = new URL(currentUrl);
  const dest = new URL(anchor.href, current);
  if (dest.origin !== current.origin) return null;
  if (dest.pathname === current.pathname && dest.search === current.search) return null;
  return dest.pathname + dest.search + dest.hash;
}
