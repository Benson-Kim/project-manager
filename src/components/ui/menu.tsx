"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";

/**
 * Accessible dropdown menu primitive (shell spec, issue #28): trigger button
 * with aria-haspopup/expanded/controls, role=menu panel, arrow-key roving
 * focus, Escape closes and returns focus, outside pointer/focus closes.
 * Compose with <MenuLink> and <MenuButton> (both role=menuitem).
 */
export function Menu({
  label,
  trigger,
  triggerClassName,
  testId,
  children,
}: {
  label: string;
  trigger: React.ReactNode;
  triggerClassName?: string;
  testId?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const items = useCallback(
    () => Array.from(rootRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []),
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
        data-testid={testId}
        className={triggerClassName}
        onClick={() => setOpen((current) => !current)}
      >
        {trigger}
      </button>
      <div
        id={panelId}
        role="menu"
        aria-label={label}
        hidden={!open}
        className="absolute right-0 z-(--z-dropdown) mt-1 min-w-48 rounded-md border border-line bg-surface-raised py-1 shadow-lg"
        onClickCapture={(event) => {
          const target = event.target as HTMLElement;
          if (target.closest('[role="menuitem"]')) setOpen(false);
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
  children,
}: {
  type?: "button" | "submit";
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button role="menuitem" tabIndex={-1} type={type} onClick={onClick} className={itemClass}>
      {children}
    </button>
  );
}
