"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Menu, MenuButton, MenuLink } from "@/components/ui/menu";
import { messages } from "@/lib/messages";
import { logoutAction } from "@/modules/auth/actions";
import { useTheme } from "../theme/theme-provider";
import { initialsFrom } from "./initials";
import { BellIcon, MoonIcon, SunIcon } from "./shell-icons";

export interface ShellAlert {
  id: number;
  title: string;
  dueDate: string;
}

const iconButtonClass =
  "relative flex min-h-10 min-w-10 items-center justify-center rounded-md text-ink-muted hover:bg-surface-sunken";

/**
 * Notifications bell (shell spec, issue #28): filled icon + red dot when
 * there are alerts, outline when none. Disclosure pattern: aria-expanded +
 * controlled panel, Escape closes and returns focus, outside click closes.
 */
export function NotificationsBell({ alerts }: { alerts: ShellAlert[] }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const hasAlerts = alerts.length > 0;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return (
    <div
      ref={rootRef}
      className="relative"
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          setOpen(false);
          triggerRef.current?.focus();
        }
      }}
      onBlur={(event) => {
        if (!rootRef.current?.contains(event.relatedTarget as Node)) setOpen(false);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={messages.app.notifications}
        data-testid="notifications-bell"
        data-state={hasAlerts ? "filled" : "outline"}
        className={iconButtonClass}
        onClick={() => setOpen((current) => !current)}
      >
        <BellIcon filled={hasAlerts} />
        {hasAlerts ? (
          <span
            data-testid="notifications-dot"
            className="absolute top-1 right-1 size-2 rounded-full bg-danger"
          />
        ) : null}
      </button>
      <div
        id={panelId}
        hidden={!open}
        className="absolute right-0 z-(--z-dialog) mt-1 w-72 rounded-md border border-line bg-surface-raised py-1 shadow-lg"
      >
        {hasAlerts ? (
          <ul aria-label={messages.app.notifications}>
            {alerts.map((alert) => (
              <li
                key={alert.id}
                className="flex min-h-10 flex-col justify-center px-6 py-1.5 text-sm"
              >
                <span className="truncate font-medium text-ink">{alert.title}</span>
                <span className="text-xs text-ink-muted">{alert.dueDate}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-6 py-2 text-sm text-ink-muted">{messages.app.noNotifications}</p>
        )}
      </div>
    </div>
  );
}

/**
 * Sun/moon theme toggle: flips html[data-theme] via the ThemeProvider (choice
 * persists in localStorage, applied pre-paint by the nonce'd inline script).
 * Icon swap is pure CSS (dark: variant) — no hydration mismatch.
 */
export function ThemeToggle() {
  const { setPreference } = useTheme();
  return (
    <button
      type="button"
      aria-label={messages.app.themeToggle}
      data-testid="theme-toggle"
      className={iconButtonClass}
      onClick={() => {
        const dark = document.documentElement.getAttribute("data-theme") === "dark";
        setPreference(dark ? "light" : "dark");
      }}
    >
      <SunIcon className="size-5 dark:hidden" />
      <MoonIcon className="hidden size-5 dark:block" />
    </button>
  );
}

/** Profile avatar (initials) with the account dropdown menu. */
export function AvatarMenu({ username }: { username: string }) {
  return (
    <Menu
      label={messages.app.account}
      testId="avatar-menu"
      triggerClassName="flex min-h-10 min-w-9 items-center justify-center rounded-md hover:bg-surface-sunken"
      trigger={
        <span className="flex size-7 items-center justify-center rounded-full bg-accent text-xs font-semibold text-on-accent">
          {initialsFrom(username)}
        </span>
      }
    >
      <MenuLink href="/change-password">{messages.auth.changePassword}</MenuLink>
      <MenuLink href="/settings">{messages.nav.settings}</MenuLink>
      <form action={logoutAction}>
        <MenuButton type="submit">{messages.auth.signOut}</MenuButton>
      </form>
    </Menu>
  );
}
