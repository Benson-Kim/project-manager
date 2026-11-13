/**
 * The look of a Panel, shared by its plain and collapsible shapes (panel.tsx,
 * panel-disclosure.tsx) so a folded section is the same card as an open one.
 * Its own module: panel.tsx stays server-renderable while the disclosure is a
 * client component.
 */
export const PANEL_SHELL =
  "flex min-w-0 flex-col gap-4 rounded-lg border border-line bg-surface shadow-sm [background-image:linear-gradient(to_bottom,var(--surface-raised),var(--surface)_40%)]";

export const PANEL_BODY = "flex flex-col gap-4 px-4 py-3";

/** Closed: the heading is the whole card, so the gap and its rule add no dead space. */
export const PANEL_CLOSED = "gap-0 [&>*]:mb-0";
