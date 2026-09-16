"use client";

import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Sheet } from "@/components/ui/dialog";
import { messages } from "@/lib/messages";
import { useAnnouncer } from "../ui/announcer";
import { AvatarMenu, NotificationsBell, ThemeToggle, type ShellAlert } from "./header-actions";
import { pageTitleFor } from "./nav-items";
import { OfflineBanner } from "./offline-banner";
import { RouteProgress } from "./route-progress";
import { MenuIcon } from "./shell-icons";
import { SidebarContent } from "./sidebar-content";

/**
 * App shell (spec in issue #28): desktop sidebar (logo, New project, nav,
 * Settings + Logout pinned) + header (page title left; bell, theme toggle,
 * avatar menu right). On < md the sidebar collapses into a drawer (the ONE
 * overlay engine — Radix Sheet: focus trap, Escape, focus return).
 */
export function AppShell({
  username,
  canCreateProject,
  alerts,
  children,
}: {
  username: string;
  canCreateProject: boolean;
  alerts: ShellAlert[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { announce } = useAnnouncer();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    announce(document.title);
    setDrawerOpen(false); // close the drawer after navigation
  }, [announce, pathname]);

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
        className="sticky top-0 hidden h-dvh w-60 shrink-0 border-r border-line bg-surface-raised p-3 md:block"
      >
        <SidebarContent canCreateProject={canCreateProject} pathname={pathname} />
      </nav>

      {/* Mobile drawer */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen} title={messages.app.menu}>
        <nav aria-label={messages.app.menu} className="-mx-1 min-h-[60dvh]">
          <SidebarContent
            canCreateProject={canCreateProject}
            pathname={pathname}
            onNavigate={() => setDrawerOpen(false)}
          />
        </nav>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-(--z-nav) flex h-14 items-center gap-1 border-b border-line bg-surface px-4">
          <button
            type="button"
            aria-label={messages.app.menu}
            data-testid="open-drawer"
            className="flex min-h-9 min-w-9 items-center justify-center rounded-md text-ink-muted hover:bg-surface-sunken md:hidden"
            onClick={() => setDrawerOpen(true)}
          >
            <MenuIcon />
          </button>
          <p className="flex-1 truncate text-base font-semibold text-ink" data-testid="page-title">
            {pageTitleFor(pathname)}
          </p>
          <NotificationsBell alerts={alerts} />
          <ThemeToggle />
          <AvatarMenu username={username} />
        </header>
        <main id="main" className="flex-1 px-4 pb-8">
          {children}
        </main>
      </div>
    </div>
  );
}
