"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { usePopoverPlacement } from "./popover-placement";

/**
 * Accessible dropdown menu primitive (shell spec, issue #28): trigger button
 * with aria-haspopup/expanded/controls, role=menu panel, arrow-key roving
 * focus, Escape closes and returns focus, outside pointer/focus closes.
 * Compose with <MenuLink> and <MenuButton> (role=menuitem, or menuitemradio
 * with aria-checked when given `checked`). Picking an item closes the menu and
 * puts focus back on the trigger. The panel opens under the trigger,
 * its right edge on the trigger's (`align="end"`) or its left edge (`"start"`),
 * moved sideways when that would cross the window's edge (360 px screens).
 */
const ITEM = '[role="menuitem"], [role="menuitemradio"]';
const EDGE_PX = 8;

/** How far to move a panel sideways so it sits inside the window, EDGE_PX from each side. */
export function shiftIntoView(left: number, right: number, windowWidth: number): number {
  if (right > windowWidth - EDGE_PX) return Math.max(windowWidth - EDGE_PX - right, EDGE_PX - left);
  if (left < EDGE_PX) return EDGE_PX - left;
  return 0;
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
  const up = usePopoverPlacement(triggerRef, panelRef, open);

  // Measured before paint, so a panel near the edge never shows cut off or widens the page.
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!open || !panel) return;
    panel.style.translate = "";
    const { left, right } = panel.getBoundingClientRect();
    const shift = shiftIntoView(left, right, document.documentElement.clientWidth);
    if (shift) panel.style.translate = `${shift}px 0`;
  }, [open]);

  const items = useCallback(
    () => Array.from(rootRef.current?.querySelectorAll<HTMLElement>(ITEM) ?? []),
    [],
  );

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
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const list = items();
      const index = list.indexOf(document.activeElement as HTMLElement);
      const next =
        event.key === "ArrowDown" ? Math.min(index + 1, list.length - 1) : Math.max(index - 1, 0);
      list[next]?.focus();
    }
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
        className={`absolute ${align === "start" ? "left-0" : "right-0"} ${up ? "bottom-full mb-1" : "mt-1"} z-(--z-dropdown) max-w-[calc(100vw-1rem)] min-w-48 rounded-md border border-line bg-surface-raised py-1 shadow-lg`}
        onClickCapture={(event) => {
          const target = event.target as HTMLElement;
          if (!target.closest(ITEM)) return;
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
  "flex min-h-10 w-full items-center px-6 text-left text-sm text-ink hover:bg-surface-sunken";

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
  testId,
  children,
}: {
  type?: "button" | "submit";
  onClick?: () => void;
  /** One choice of several (a colour, a style): role=menuitemradio with aria-checked. */
  checked?: boolean;
  testId?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      role={checked === undefined ? "menuitem" : "menuitemradio"}
      aria-checked={checked}
      tabIndex={-1}
      type={type}
      onClick={onClick}
      data-testid={testId}
      className={`${itemClass} gap-2 aria-checked:font-semibold`}
    >
      {children}
    </button>
  );
}
