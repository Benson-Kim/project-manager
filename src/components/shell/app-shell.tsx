"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect } from "react";
import { messages } from "@/lib/messages";
import { useAnnouncer } from "../ui/announcer";
import { useTheme, type ThemePreference } from "../theme/theme-provider";
import { navItems } from "./nav-items";
import { OfflineBanner } from "./offline-banner";
import { RouteProgress } from "./route-progress";

/**
 * The ONE navigation pattern (STANDARDS §5.3): bottom tab bar < md, sidebar
 * >= md. Safe-area padded, 44 px targets, current page announced.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { announce } = useAnnouncer();
  const { preference, setPreference } = useTheme();

  useEffect(() => {
    announce(document.title);
  }, [announce, pathname]);

  const tabs = navItems.slice(0, 4);

  return (
    <div className="flex min-h-dvh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-(--z-toast) focus:rounded-md focus:bg-surface focus:p-3"
      >
        {messages.app.skipToContent}
      </a>
      {/* useSearchParams requires a Suspense boundary at build time */}
      <Suspense fallback={null}>
        <RouteProgress />
      </Suspense>
      <OfflineBanner />

      {/* Desktop sidebar */}
      <nav
        aria-label={messages.app.menu}
        className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r border-line bg-surface-raised p-3 md:flex"
      >
        <p className="px-3 py-4 text-sm font-semibold text-ink">{messages.app.name}</p>
        <ul className="flex flex-1 flex-col gap-1">
          {navItems.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={pathname === item.href ? "page" : undefined}
                className={`flex min-h-11 items-center rounded-md px-3 text-sm font-medium ${
                  pathname === item.href
                    ? "bg-accent-soft text-accent"
                    : "text-ink-muted hover:bg-surface-sunken"
                }`}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
        <label className="flex flex-col gap-1 px-3 pb-2">
          <span className="text-xs font-medium text-ink-muted">{messages.app.themeLabel}</span>
          <select
            value={preference}
            onChange={(e) => setPreference(e.target.value as ThemePreference)}
            className="min-h-11 rounded-md border border-line bg-surface px-2 text-sm text-ink"
          >
            <option value="system">{messages.app.themeSystem}</option>
            <option value="light">{messages.app.themeLight}</option>
            <option value="dark">{messages.app.themeDark}</option>
          </select>
        </label>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <main id="main" className="flex-1 px-4 pb-24 md:pb-8">
          {children}
        </main>
      </div>

      {/* Mobile bottom tab bar */}
      <nav
        aria-label={messages.app.menu}
        className="fixed inset-x-0 bottom-0 z-(--z-nav) border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <ul className="flex">
          {tabs.map((item) => (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={pathname === item.href ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium ${
                  pathname === item.href ? "text-accent" : "text-ink-muted"
                }`}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
