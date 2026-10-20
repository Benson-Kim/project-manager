"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { TONES } from "@/components/ui/tones";
import { formatDate } from "@/lib/format";
import type { OptionColor } from "@/lib/lookup-lists";
import { messages } from "@/lib/messages";
import type { WbsNode } from "../schemas/wbs";

const W = messages.keyDeliverables.wbs;

/** One entry of the menu: the toolbar's commands, as ToolbarCommand plus a label. */
export interface MenuCommand {
  label: string;
  run: () => void;
  testId: string;
  /** Not offered at all (no permission). */
  hidden?: boolean;
  disabled?: boolean;
  danger?: boolean;
}

/** Where the menu opens: viewport coordinates, and whether straight on the status list. */
export interface MenuRequest {
  x: number;
  y: number;
  /** Open straight on the status list (the status chip). */
  status: boolean;
  /** Where the focus goes back to when the menu closes without acting. */
  returnFocus: HTMLElement | null;
}

/** The open menu and the item it is for; null when closed. */
export interface WbsMenuState extends MenuRequest {
  id: number;
}

/** Below the element's bottom-left corner: where a menu opened from the keyboard or a click goes. */
export function menuBelow(el: HTMLElement, status = false): MenuRequest {
  const box = el.getBoundingClientRect();
  return { x: box.left, y: box.bottom + 4, status, returnFocus: el };
}

/** Shift+F10 or the menu key: the keyboard's right-click. */
export function isMenuKey(event: React.KeyboardEvent): boolean {
  return event.key === "ContextMenu" || (event.shiftKey && event.key === "F10");
}

export interface StatusChoice {
  label: string;
  color: OptionColor | null;
}

/** A gap kept between the menu and the edge of the window. */
const EDGE = 8;

const itemClass =
  "flex min-h-10 w-full cursor-pointer items-center gap-2 px-4 text-left text-sm text-ink " +
  "hover:bg-surface-sunken focus:bg-surface-sunken focus:outline-none disabled:cursor-default disabled:opacity-50";

function enabledItems(root: HTMLElement | null): HTMLElement[] {
  return Array.from(
    root?.querySelectorAll<HTMLElement>(
      ':scope > [role="menuitemradio"]:not(:disabled), :scope > div > [role="menuitem"]:not(:disabled)',
    ) ?? [],
  );
}

/** Keeps a box of the given size inside the window, preferring below-right of (x, y). */
function placeWithin(x: number, y: number, width: number, height: number) {
  const maxX = window.innerWidth - width - EDGE;
  const maxY = window.innerHeight - height - EDGE;
  return {
    left: Math.max(EDGE, Math.min(x, maxX)),
    top: Math.max(EDGE, y > maxY ? Math.max(EDGE, y - height) : y),
  };
}

/** Moves the focus among a menu's enabled items with the arrow keys, Home and End. */
function rove(event: React.KeyboardEvent, menu: HTMLElement | null): boolean {
  const list = enabledItems(menu);
  if (list.length === 0) return false;
  const at = list.indexOf(document.activeElement as HTMLElement);
  let next: number;
  switch (event.key) {
    case "ArrowDown":
      next = at < 0 ? 0 : (at + 1) % list.length;
      break;
    case "ArrowUp":
      next = at < 0 ? list.length - 1 : (at - 1 + list.length) % list.length;
      break;
    case "Home":
      next = 0;
      break;
    case "End":
      next = list.length - 1;
      break;
    default:
      return false;
  }
  event.preventDefault();
  list[next]?.focus();
  return true;
}

/**
 * The menu a work breakdown item opens on a right-click, on a click on its
 * name, or with Shift+F10 / the menu key (ADR-0034). Its header shows the
 * item's whole name, which the box and the outline may cut short; below it are
 * the toolbar's commands for that item and a Status list, whose colour the box
 * and the bar take. Arrow keys move through it, → opens the status list, ← and
 * Escape step back out, and the focus returns where it came from.
 */
export function WbsContextMenu({
  state,
  node,
  groups,
  statuses,
  canSetStatus,
  onStatus,
  onClose,
}: {
  state: WbsMenuState;
  node: WbsNode;
  /** Commands in groups, drawn with a line between groups. */
  groups: MenuCommand[][];
  statuses: StatusChoice[];
  canSetStatus: boolean;
  onStatus: (status: string | null) => void;
  /** `refocus`: put the focus back where the menu opened from. */
  onClose: (refocus: boolean) => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLButtonElement>(null);
  const subRef = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null);
  const [subOpen, setSubOpen] = useState(state.status && canSetStatus);
  const [subPlace, setSubPlace] = useState<{ left: number; top: number } | null>(null);

  const item = node.item;
  const name = item.name || messages.keyDeliverables.deliverableFallback(item.id);
  const current = item.status;
  const dated = node.start !== null && node.end !== null;

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const box = menu.getBoundingClientRect();
    setPlace(placeWithin(state.x, state.y, box.width, box.height));
  }, [state.x, state.y]);

  useLayoutEffect(() => {
    const anchor = statusRef.current;
    const sub = subRef.current;
    if (!subOpen || !anchor || !sub) return;
    const from = anchor.getBoundingClientRect();
    const box = sub.getBoundingClientRect();
    const right = from.right - 4;
    const left = right + box.width > window.innerWidth - EDGE ? from.left - box.width + 4 : right;
    setSubPlace(placeWithin(left, from.top - 4, box.width, box.height));
  }, [subOpen, place]);

  // The first item, or the current status when the menu opened on the status list.
  useEffect(() => {
    if (!place) return;
    if (subOpen && subPlace) {
      const sub = subRef.current;
      const checked = sub?.querySelector<HTMLElement>('[aria-checked="true"]');
      (checked ?? enabledItems(sub)[0])?.focus();
    } else if (!subOpen) {
      const menu = menuRef.current;
      if (!menu?.contains(document.activeElement)) enabledItems(menu)[0]?.focus();
    }
  }, [place, subOpen, subPlace]);

  // Any press outside, a scroll of the page or a resize closes it.
  useEffect(() => {
    const inside = (target: EventTarget | null) =>
      target instanceof Node &&
      (menuRef.current?.contains(target) || subRef.current?.contains(target));
    const onPointerDown = (event: PointerEvent) => {
      if (!inside(event.target)) onClose(false);
    };
    const onScroll = (event: Event) => {
      if (!inside(event.target)) onClose(false);
    };
    const onResize = () => onClose(false);
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [onClose]);

  function closeSub() {
    setSubOpen(false);
    setSubPlace(null);
    statusRef.current?.focus();
  }

  function onMenuKey(event: React.KeyboardEvent<HTMLDivElement>) {
    if (rove(event, menuRef.current)) return;
    if (event.key === "Escape") {
      event.preventDefault();
      onClose(true);
    } else if (event.key === "Tab") {
      event.preventDefault();
      onClose(true);
    } else if (event.key === "ArrowRight" && document.activeElement === statusRef.current) {
      event.preventDefault();
      setSubOpen(true);
    }
  }

  function onSubKey(event: React.KeyboardEvent<HTMLDivElement>) {
    event.stopPropagation();
    if (rove(event, subRef.current)) return;
    if (event.key === "Escape" || event.key === "ArrowLeft") {
      event.preventDefault();
      closeSub();
    } else if (event.key === "Tab") {
      event.preventDefault();
      onClose(true);
    }
  }

  function act(run: () => void) {
    onClose(false);
    run();
  }

  const visibleGroups = groups
    .map((group) => group.filter((command) => !command.hidden))
    .filter((group) => group.length > 0);
  const statusTone = current ? statuses.find((s) => s.label === current)?.color : null;

  return createPortal(
    <>
      <div
        ref={menuRef}
        role="menu"
        aria-label={W.actionsFor(name)}
        data-testid="wbs-menu"
        className="fixed z-(--z-dropdown) w-72 max-w-[calc(100vw-1rem)] rounded-md border border-line bg-surface-raised py-1 shadow-lg print:hidden"
        style={place ?? { left: state.x, top: state.y, visibility: "hidden" }}
        onKeyDown={onMenuKey}
        onContextMenu={(event) => event.preventDefault()}
      >
        <div role="none" className="flex flex-col gap-1 border-b border-line px-4 pt-2 pb-2.5">
          <p
            data-testid="wbs-menu-name"
            className="flex gap-2 text-sm font-semibold text-ink wrap-anywhere"
          >
            <span className="shrink-0 font-normal text-ink-muted tabular-nums">{node.code}</span>
            <span className="min-w-0">{name}</span>
          </p>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted tabular-nums">
            <span>
              {dated ? W.dateRange(formatDate(node.start!), formatDate(node.end!)) : W.noDates}
            </span>
            {current ? (
              <span
                className={`rounded-full border px-2 py-0.5 font-medium ${
                  statusTone ? TONES[statusTone].badge : "border-line text-ink"
                }`}
              >
                {current}
              </span>
            ) : null}
          </p>
        </div>
        {visibleGroups.map((group, g) => (
          <div key={g} role="none" className={g > 0 ? "border-t border-line pt-1" : "pb-1"}>
            {group.map((command) => (
              <button
                key={command.testId}
                type="button"
                role="menuitem"
                tabIndex={-1}
                data-testid={command.testId}
                disabled={command.disabled}
                onClick={() => act(command.run)}
                className={`${itemClass} ${command.danger ? "text-danger" : ""}`}
              >
                {command.label}
              </button>
            ))}
            {g === 0 && canSetStatus ? (
              <button
                ref={statusRef}
                type="button"
                role="menuitem"
                tabIndex={-1}
                aria-haspopup="menu"
                aria-expanded={subOpen}
                data-testid="wbs-menu-status"
                onClick={() => (subOpen ? closeSub() : setSubOpen(true))}
                className={`${itemClass} justify-between`}
              >
                <span>{W.status}</span>
                <svg viewBox="0 0 16 16" aria-hidden="true" className="size-3.5" fill="currentColor">
                  <path d="M6 3l5 5-5 5z" />
                </svg>
              </button>
            ) : null}
          </div>
        ))}
      </div>
      {subOpen && canSetStatus ? (
        <div
          ref={subRef}
          role="menu"
          aria-label={W.status}
          data-testid="wbs-menu-statuses"
          className="fixed z-(--z-dropdown) max-h-[min(24rem,calc(100dvh-1rem))] w-56 overflow-y-auto rounded-md border border-line bg-surface-raised py-1 shadow-lg print:hidden"
          style={subPlace ?? { left: 0, top: 0, visibility: "hidden" }}
          onKeyDown={onSubKey}
          onContextMenu={(event) => event.preventDefault()}
        >
          {[{ label: null, color: null } as { label: string | null; color: OptionColor | null }]
            .concat(statuses)
            .map((choice) => {
              const checked = (choice.label ?? null) === (current ?? null);
              return (
                <button
                  key={choice.label ?? ""}
                  type="button"
                  role="menuitemradio"
                  tabIndex={-1}
                  aria-checked={checked}
                  data-testid={`wbs-status-${choice.label ?? "none"}`}
                  onClick={() => act(() => onStatus(choice.label))}
                  className={itemClass}
                >
                  <span
                    aria-hidden="true"
                    className={`size-3 shrink-0 rounded-full border ${
                      choice.color ? TONES[choice.color].swatch : "border-line bg-surface"
                    }`}
                  />
                  <span className="min-w-0 flex-1 truncate">{choice.label ?? W.noStatus}</span>
                  {checked ? (
                    <svg
                      viewBox="0 0 16 16"
                      aria-hidden="true"
                      className="size-3.5 shrink-0"
                      fill="currentColor"
                    >
                      <path d="M6.2 11.6L2.6 8l1.1-1.1 2.5 2.5 6-6L13.4 4.5z" />
                    </svg>
                  ) : null}
                </button>
              );
            })}
        </div>
      ) : null}
    </>,
    document.body,
  );
}
