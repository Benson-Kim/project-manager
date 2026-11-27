"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useId, useRef, useState } from "react";
import { Menu, MenuButton, MenuLink } from "@/components/ui/menu";
import { messages } from "@/lib/messages";
import { logoutAction } from "@/modules/auth/actions";
import { SEARCH_MAX_LENGTH } from "@/modules/search/schemas/search";
import { useTheme } from "../theme/theme-provider";
import { initialsFrom } from "./initials";
import { bellLook } from "./bell-look";
import { BellIcon, MoonIcon, NewWindowIcon, SunIcon } from "./shell-icons";

export interface ShellAlert {
  id: number;
  title: string;
  dueDate: string;
}

const iconButtonBase =
  "relative flex min-h-10 min-w-9 sm:min-w-10 items-center justify-center rounded-md hover:bg-hover";
const iconButtonClass = `${iconButtonBase} text-ink-muted`;

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function HeaderSearchInner({ pathname }: { pathname: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlQuery = pathname === "/search" ? (searchParams.get("q") ?? "") : "";
  const [query, setQuery] = useState(urlQuery);
  const [mobileOpen, setMobileOpen] = useState(false);

  const syncKey = `${pathname}\0${urlQuery}`;
  const [prevSyncKey, setPrevSyncKey] = useState(syncKey);
  if (prevSyncKey !== syncKey) {
    setPrevSyncKey(syncKey);
    setQuery(urlQuery);
    setMobileOpen(false);
  }

  const desktopInputId = useId();
  const mobileInputId = useId();
  const overlayId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const overlayRef = useRef<HTMLFormElement>(null);
  const overlayInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mobileOpen) overlayInputRef.current?.focus();
  }, [mobileOpen]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!overlayRef.current?.contains(target) && !triggerRef.current?.contains(target)) {
        setMobileOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [mobileOpen]);

  function submit(rawValue: string, closeOverlay: boolean) {
    const trimmed = rawValue.trim();
    if (closeOverlay) setMobileOpen(false);
    router.push(trimmed ? `/search?q=${encodeURIComponent(trimmed)}` : "/search");
  }

  return (
    <>
      <form
        role="search"
        action="/search"
        method="get"
        aria-label={messages.search.queryLabel}
        data-testid="header-search-form"
        className="hidden lg:flex items-center"
        onSubmit={(event) => {
          event.preventDefault();
          submit(query, false);
        }}
      >
        <label htmlFor={desktopInputId} className="sr-only">
          {messages.search.queryLabel}
        </label>
        <div className="relative flex items-center">
          <SearchIcon className="pointer-events-none absolute left-2.5 size-4 text-ink-muted" />
          <input
            id={desktopInputId}
            type="search"
            name="q"
            autoComplete="off"
            maxLength={SEARCH_MAX_LENGTH}
            placeholder={messages.search.placeholder}
            data-testid="header-search-input"
            className="min-h-10 w-48 xl:w-64 rounded-md border border-line bg-surface pr-3 pl-8 text-sm text-ink placeholder:text-ink-faint"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </form>
      <button
        ref={triggerRef}
        type="button"
        aria-label={messages.search.title}
        aria-expanded={mobileOpen}
        aria-controls={mobileOpen ? overlayId : undefined}
        data-testid="header-search-trigger"
        className={`${iconButtonClass} lg:hidden`}
        onClick={() => setMobileOpen((open) => !open)}
      >
        <SearchIcon className="size-5" />
      </button>
      {mobileOpen ? (
        <form
          ref={overlayRef}
          id={overlayId}
          role="search"
          action="/search"
          method="get"
          aria-label={messages.search.queryLabel}
          data-testid="header-search-overlay"
          className="absolute inset-0 z-(--z-dropdown) flex items-center gap-2 rounded-t-md bg-surface px-2.5 sm:px-4 lg:hidden"
          onSubmit={(event) => {
            event.preventDefault();
            submit(query, true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setMobileOpen(false);
              triggerRef.current?.focus();
            }
          }}
        >
          <label htmlFor={mobileInputId} className="sr-only">
            {messages.search.queryLabel}
          </label>
          <input
            ref={overlayInputRef}
            id={mobileInputId}
            type="search"
            name="q"
            autoComplete="off"
            maxLength={SEARCH_MAX_LENGTH}
            placeholder={messages.search.placeholder}
            data-testid="header-search-overlay-input"
            className="min-h-10 min-w-0 flex-1 rounded-md border border-line bg-surface px-3 text-sm text-ink placeholder:text-ink-faint"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button
            type="submit"
            data-testid="header-search-overlay-submit"
            className="inline-flex min-h-10 shrink-0 items-center rounded-md bg-primary px-3 text-sm font-medium text-on-primary hover:bg-primary-hover"
          >
            {messages.search.submit}
          </button>
          <button
            type="button"
            aria-label={messages.search.closeSearch}
            data-testid="header-search-overlay-close"
            className="flex min-h-10 min-w-9 shrink-0 items-center justify-center rounded-md text-ink-muted hover:bg-hover"
            onClick={() => {
              setMobileOpen(false);
              triggerRef.current?.focus();
            }}
          >
            <CloseIcon className="size-5" />
          </button>
        </form>
      ) : null}
    </>
  );
}

function HeaderSearchFallback() {
  return (
    <>
      <div aria-hidden="true" className="hidden h-10 w-48 xl:w-64 lg:block" />
      <div aria-hidden="true" className="h-10 w-9 sm:w-10 lg:hidden" />
    </>
  );
}

/**
 * Responsive global search control: compact inline form at lg+ and a single
 * icon trigger expanding an inline full-header overlay below lg (375px-safe).
 */
export function HeaderSearch({ pathname }: { pathname: string }) {
  return (
    <Suspense fallback={<HeaderSearchFallback />}>
      <HeaderSearchInner pathname={pathname} />
    </Suspense>
  );
}

/** A to-do alarm that is due now (the open app's 30 s poll, useAlertPoller). */
export interface ShellAlarm {
  todoAlertId: number;
  todoItemId: number;
  title: string;
}

/**
 * Notifications bell (shell spec, issue #28): filled icon + red dot when
 * there are alerts, outline when none. Disclosure pattern: aria-expanded +
 * controlled panel, Escape closes and returns focus, outside click closes.
 * Due to-do alarms come first ("Due now", each opens its to-do); while desktop
 * notifications are not decided yet, the panel offers to turn them on (the
 * browser only asks after a click).
 */
export function NotificationsBell({
  alerts,
  alarms = [],
}: {
  alerts: ShellAlert[];
  alarms?: ShellAlarm[];
}) {
  const [open, setOpen] = useState(false);
  const [canAskDesktop, setCanAskDesktop] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { state, ringing, count } = bellLook(alerts.length, alarms.length);
  const hasAlerts = state === "filled";

  // Notification.permission exists only in the browser: read it after mount (no hydration mismatch).
  useEffect(() => {
    if (!open || !("Notification" in window)) return;
    const frame = requestAnimationFrame(() =>
      setCanAskDesktop(Notification.permission === "default"),
    );
    return () => cancelAnimationFrame(frame);
  }, [open]);

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
        aria-label={
          hasAlerts ? messages.app.notificationsWithCount(count) : messages.app.notifications
        }
        data-testid="notifications-bell"
        data-state={state}
        data-ringing={ringing}
        className={`${iconButtonBase} ${ringing ? "text-danger" : "text-ink-muted"}`}
        onClick={() => setOpen((current) => !current)}
      >
        <BellIcon filled={hasAlerts} />
        {hasAlerts ? (
          <span
            aria-hidden="true"
            data-testid="notifications-dot"
            className="absolute top-1 right-1 size-2 rounded-full bg-danger"
          />
        ) : null}
      </button>
      <div
        id={panelId}
        hidden={!open}
        className="absolute right-0 z-(--z-dropdown) mt-1 w-72 rounded-md border border-line bg-surface-raised py-1 shadow-lg"
      >
        {alarms.length > 0 ? (
          <ul aria-label={messages.app.alarmsDue} data-testid="due-alarms">
            {alarms.map((alarm) => (
              <li key={alarm.todoAlertId}>
                <Link
                  href={`/todo?id=${alarm.todoItemId}`}
                  onClick={() => setOpen(false)}
                  className="flex min-h-10 flex-col justify-center px-6 py-1.5 text-sm hover:bg-hover"
                >
                  <span className="text-xs font-semibold text-warning">
                    {messages.app.alarmsDue}
                  </span>
                  <span className="truncate font-medium text-ink">{alarm.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
        {canAskDesktop ? (
          <button
            type="button"
            onClick={() =>
              void Notification.requestPermission().then((result) =>
                setCanAskDesktop(result === "default"),
              )
            }
            className="w-full px-6 py-2 text-left text-sm font-medium text-accent hover:bg-hover"
          >
            {messages.app.enableDesktopAlerts}
          </button>
        ) : null}
        {alerts.length > 0 ? (
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
        ) : alarms.length === 0 ? (
          <p className="px-6 py-2 text-sm text-ink-muted">{messages.app.noNotifications}</p>
        ) : null}
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

/**
 * Opens this page in a window of its own, to move it onto another display
 * The desktop app places it on the other screen and
 * remembers where it was left; a browser opens a separate window. Not on phones.
 */
export function NewWindowButton() {
  return (
    <button
      type="button"
      aria-label={messages.app.openInNewWindow}
      data-testid="open-in-new-window"
      className={`${iconButtonClass} max-sm:hidden`}
      onClick={() =>
        window.open(
          window.location.href,
          "_blank",
          `popup,noopener,width=${window.outerWidth},height=${window.outerHeight}`,
        )
      }
    >
      <NewWindowIcon />
    </button>
  );
}

/** Profile avatar (initials) with the account dropdown menu. */
export function AvatarMenu({ username }: { username: string }) {
  return (
    <Menu
      label={messages.app.account}
      testId="avatar-menu"
      triggerClassName="flex min-h-10 min-w-9 items-center justify-center rounded-md hover:bg-hover"
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
