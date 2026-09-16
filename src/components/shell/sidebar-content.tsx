"use client";

import Link from "next/link";
import { messages } from "@/lib/messages";
import { logoutAction } from "@/modules/auth/actions";
import { navItems, settingsNavItem } from "./nav-items";
import { LogoMark } from "./shell-icons";

function isCurrent(pathname: string, href: string): boolean {
  return pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
}

const navLinkClass = (current: boolean) =>
  `flex min-h-9 items-center rounded-md px-6 text-sm font-medium ${
    current ? "bg-accent-soft text-accent" : "text-ink-muted hover:bg-surface-sunken"
  }`;

/**
 * Sidebar body (shell spec, issue #28), shared by the desktop sidebar and the
 * mobile drawer: logo, New project (RBAC projects:create), nav items, then
 * Settings and Logout pinned at the bottom.
 */
export function SidebarContent({
  canCreateProject,
  pathname,
  onNavigate,
}: {
  canCreateProject: boolean;
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <Link href="/" onClick={onNavigate} className="flex items-center gap-2 px-3 py-4">
        <LogoMark />
        <span className="text-sm font-semibold text-ink">{messages.app.name}</span>
      </Link>
      {canCreateProject ? (
        <Link
          href="/projects/new"
          onClick={onNavigate}
          data-testid="shell-new-project"
          className="mx-3 mb-3 inline-flex min-h-9 items-center justify-center rounded-md bg-accent px-6 text-sm font-medium text-on-accent hover:bg-accent-strong"
        >
          {messages.projects.newProject}
        </Link>
      ) : null}
      <ul className="flex flex-1 flex-col gap-1 overflow-y-auto">
        {navItems.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={isCurrent(pathname, item.href) ? "page" : undefined}
              className={navLinkClass(isCurrent(pathname, item.href))}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
      <ul className="flex flex-col gap-1 border-t border-line pt-2">
        <li>
          <Link
            href={settingsNavItem.href}
            onClick={onNavigate}
            aria-current={isCurrent(pathname, settingsNavItem.href) ? "page" : undefined}
            className={navLinkClass(isCurrent(pathname, settingsNavItem.href))}
          >
            {settingsNavItem.label}
          </Link>
        </li>
        <li>
          <form action={logoutAction}>
            <button
              type="submit"
              className="flex min-h-9 w-full items-center rounded-md px-6 text-sm font-medium text-ink-muted hover:bg-surface-sunken"
            >
              {messages.auth.signOut}
            </button>
          </form>
        </li>
      </ul>
    </div>
  );
}
