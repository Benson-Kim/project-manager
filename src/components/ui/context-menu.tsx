"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { CLOSES, menuItemsIn, stepMenuFocus } from "./menu";

const EDGE = 8;

/**
 * A menu opened at a point, as a right-click opens one. It takes the same <MenuButton> items as <Menu>:
 * arrows move focus, Escape, Tab or a click elsewhere closes it, and focus goes back where it was.
 */
export function ContextMenu({
  at,
  label,
  onClose,
  children,
}: {
  at: { x: number; y: number };
  label: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const { width, height } = panel.getBoundingClientRect();
    panel.style.left = `${Math.max(EDGE, Math.min(at.x, window.innerWidth - width - EDGE))}px`;
    panel.style.top = `${Math.max(EDGE, Math.min(at.y, window.innerHeight - height - EDGE))}px`;
  }, [at]);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    menuItemsIn(panelRef.current)[0]?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) close.current();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  return createPortal(
    <div
      ref={panelRef}
      role="menu"
      aria-label={label}
      style={{ left: at.x, top: at.y }}
      className="fixed z-(--z-dropdown) max-w-[calc(100vw-1rem)] min-w-48 overflow-hidden rounded-lg border border-line bg-surface shadow-lg"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          close.current();
          return;
        }
        stepMenuFocus(event, menuItemsIn(panelRef.current));
      }}
      onBlur={(event) => {
        if (!panelRef.current?.contains(event.relatedTarget as Node)) close.current();
      }}
      onClick={(event) => {
        // Close on the bubble, after the item's own onClick: the parent unmounts this menu when
        // it closes, and a trusted click flushes that unmount synchronously, so closing in the
        // capture phase would remove the item before its handler ever ran.
        if ((event.target as HTMLElement).closest(CLOSES)) close.current();
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
