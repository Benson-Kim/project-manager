"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { usePopoverPlacement } from "./popover-placement";

/**
 * Accessible dropdown menu primitive (shell spec, issue #28): trigger button
 * with aria-haspopup/expanded/controls, role=menu panel, arrow-key roving
 * focus, Escape closes and returns focus, outside pointer/focus closes.
 * Compose with <MenuLink> and <MenuButton> (role=menuitem, or menuitemradio
 * with aria-checked when given `checked`). Picking an item closes the menu and
 * puts focus back on the trigger; a <MenuCheckbox> (menuitemcheckbox) toggles
 * and leaves the menu open, so several can be set in one visit. The panel opens under the trigger,
 * its right edge on the trigger's (`align="end"`) or its left edge (`"start"`),
 * moved sideways when that would cross the window's edge (360 px screens). A menu taller than
 * the room on its side scrolls, so its last items never fall off the window.
 */
const ITEM = '[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]';
export const CLOSES = '[role="menuitem"], [role="menuitemradio"]';

export function menuItemsIn(root: HTMLElement | null) {
  return Array.from(root?.querySelectorAll<HTMLElement>(ITEM) ?? []);
}

/** Up and down arrows move focus through the items, stopping at either end; Home and End jump to them. */
export function stepMenuFocus(event: React.KeyboardEvent, list: readonly HTMLElement[]) {
  const index = list.indexOf(document.activeElement as HTMLElement);
  const next = {
    ArrowDown: Math.min(index + 1, list.length - 1),
    ArrowUp: Math.max(index - 1, 0),
    Home: 0,
    End: list.length - 1,
  }[event.key];
  if (next === undefined) return;
  event.preventDefault();
  list[next]?.focus();
}

export function Menu({
  label,
  trigger,
  triggerClassName,
  shortcut,
  testId,
  align = "end",
  children,
}: {
  label: string;
  trigger: React.ReactNode;
  triggerClassName?: string;
  /** The trigger's aria-keyshortcuts, when a key does what the menu's main choice does. */
  shortcut?: string;
  testId?: string;
  align?: "start" | "end";
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  usePopoverPlacement(triggerRef, panelRef, open, {
    align,
    fit: true,
    maxHeight: Number.POSITIVE_INFINITY,
  });

  const items = useCallback(() => menuItemsIn(rootRef.current), []);

  useEffect(() => {
    if (!open) return;
    items()[0]?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, items]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    stepMenuFocus(event, items());
  };

  return (
    <div
      ref={rootRef}
      className="relative"
      onKeyDown={onKeyDown}
      onBlur={(event) => {
        if (!rootRef.current?.contains(event.relatedTarget as Node)) setOpen(false);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={label}
        aria-keyshortcuts={shortcut}
        data-testid={testId}
        className={triggerClassName}
        onClick={() => setOpen((current) => !current)}
      >
        {trigger}
      </button>
      <div
        ref={panelRef}
        id={panelId}
        role="menu"
        aria-label={label}
        hidden={!open}
        className="fixed z-(--z-dropdown) max-w-[calc(100vw-1rem)] min-w-48 overflow-y-auto overscroll-contain rounded-lg border border-line bg-surface shadow-lg"
        onClickCapture={(event) => {
          const target = event.target as HTMLElement;
          if (!target.closest(CLOSES)) return;
          // Before the item's own handler: a dialog it opens returns focus to the trigger,
          // not to a hidden item, and an item that focuses something else still wins.
          triggerRef.current?.focus();
          setOpen(false);
        }}
      >
        {children}
      </div>
    </div>
  );
}

const itemClass =
  "flex min-h-10 w-full items-center px-4 py-2.5 text-left text-sm text-ink first:rounded-t-lg last:rounded-b-lg transition-colors duration-(--duration-fast) hover:bg-hover";

export function MenuLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link role="menuitem" tabIndex={-1} href={href} className={itemClass}>
      {children}
    </Link>
  );
}

export function MenuButton({
  type = "button",
  onClick,
  checked,
  icon,
  shortcut,
  tone = "default",
  testId,
  children,
}: {
  type?: "button" | "submit";
  onClick?: () => void;
  /** One choice of several (a colour, a style): role=menuitemradio with aria-checked. */
  checked?: boolean;
  /** A small icon before the text. */
  icon?: React.ReactNode;
  /** The key that does the same outside the menu, shown at the right, e.g. "F2" or "Del". */
  shortcut?: { label: string; keys: string };
  /** "danger" for an item that removes something. */
  tone?: "default" | "danger";
  testId?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      role={checked === undefined ? "menuitem" : "menuitemradio"}
      aria-checked={checked}
      aria-keyshortcuts={shortcut?.keys}
      tabIndex={-1}
      type={type}
      onClick={onClick}
      data-testid={testId}
      className={`${itemClass} gap-2 aria-checked:font-semibold ${tone === "danger" ? "text-danger" : ""}`}
    >
      {icon ? (
        <span className="flex size-4 shrink-0 items-center justify-center">{icon}</span>
      ) : null}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {shortcut ? (
        <kbd aria-hidden="true" className="ml-4 shrink-0 font-sans text-xs text-ink-muted">
          {shortcut.label}
        </kbd>
      ) : null}
    </button>
  );
}

/** A thin line between groups of items. */
export function MenuSeparator() {
  return <div role="separator" className="my-1 border-t border-line" />;
}

/** An on/off setting in a menu: toggling it keeps the menu open. */
export function MenuCheckbox({
  checked,
  onChange,
  testId,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  testId?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      role="menuitemcheckbox"
      aria-checked={checked}
      tabIndex={-1}
      type="button"
      onClick={() => onChange(!checked)}
      data-testid={testId}
      className={`${itemClass} gap-2 pl-2`}
    >
      <span
        aria-hidden="true"
        className={`flex size-4 shrink-0 items-center justify-center rounded-sm border text-[11px] leading-none ${checked ? "border-accent bg-accent text-on-accent" : "border-ink-faint"}`}
      >
        {checked ? "✓" : null}
      </span>
      {children}
    </button>
  );
}
