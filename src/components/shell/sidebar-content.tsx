"use client";

import Link from "next/link";
import { messages } from "@/lib/messages";
import { logoutAction } from "@/modules/auth/actions";
import { navItems, settingsNavItem } from "./nav-items";
import { LogoMark, SidebarIcon } from "./shell-icons";

function isCurrent(pathname: string, href: string): boolean {
  return pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
}

function getCreateAction(
  pathname: string,
  permissions: {
    canCreateProject: boolean;
    canCreateDailyActivity: boolean;
    canCreateTodo: boolean;
  },
) {
  if (pathname === "/daily-activities" || pathname.startsWith("/daily-activities/")) {
    return permissions.canCreateDailyActivity
      ? { href: "/daily-activities/new", label: messages.dailyActivities.newActivity }
      : null;
  }
  if (pathname === "/todo" || pathname.startsWith("/todo/")) {
    return permissions.canCreateTodo
      ? { href: "/todo/new", label: messages.todoItems.newTodoItem }
      : null;
  }
  return permissions.canCreateProject
    ? { href: "/projects/new", label: messages.projects.newProject }
    : null;
}

const navLinkClass = (current: boolean, href: string) =>
  `flex items-center gap-3 rounded-xl p-3 text-base leading-6 font-medium
   hover:bg-accent-soft hover:text-accent ${
     current ? "bg-surface text-accent" : "text-ink-muted hover:bg-surface-sunken"
   }`;

/**
 * Sidebar body (shell spec, issue #28), shared by the desktop sidebar and the
 * mobile drawer: logo, New project (RBAC projects:create), nav items, then
 * Settings and Logout pinned at the bottom.
 */
export function SidebarContent({
  canCreateProject,
  canCreateDailyActivity,
  canCreateTodo,
  pathname,
  onNavigate,
}: {
  canCreateProject: boolean;
  canCreateDailyActivity: boolean;
  canCreateTodo: boolean;
  pathname: string;
  onNavigate?: () => void;
}) {
  const createAction = getCreateAction(pathname, {
    canCreateProject,
    canCreateDailyActivity,
    canCreateTodo,
  });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Link href="/" onClick={onNavigate} className="flex items-center gap-2 px-3 py-4 mb-4">
        <LogoMark />
        <span className="text-sm font-semibold text-ink">{messages.app.name}</span>
      </Link>
      {createAction ? (
        <Link
          href={createAction.href}
          onClick={onNavigate}
          data-testid={
            createAction.href === "/projects/new" ? "shell-new-project" : "shell-new-action"
          }
          className="flex items-center gap-3 rounded-xl p-3 text-base leading-6 bg-accent text-on-accent hover:bg-accent-strong mb-2"
        >
          <SidebarIcon name="add" />
          {createAction.label}
        </Link>
      ) : null}
      <ul data-testid="nav-primary" className="flex flex-1 flex-col gap-2 overflow-y-auto">
        {navItems.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={isCurrent(pathname, item.href) ? "page" : undefined}
              className={navLinkClass(isCurrent(pathname, item.href), item.href)}
            >
              <SidebarIcon name={item.icon} />
              <span>{item.label}</span>
            </Link>
          </li>
        ))}
      </ul>
      <ul data-testid="nav-bottom" className="flex flex-col gap-1 pt-2">
        <li>
          <Link
            href={settingsNavItem.href}
            onClick={onNavigate}
            aria-current={isCurrent(pathname, settingsNavItem.href) ? "page" : undefined}
            className={navLinkClass(
              isCurrent(pathname, settingsNavItem.href),
              settingsNavItem.href,
            )}
          >
            <SidebarIcon name={settingsNavItem.icon} />
            <span>{settingsNavItem.label}</span>
          </Link>
        </li>
        <li>
          <form action={logoutAction}>
            <button
              type="submit"
              className="flex w-full items-center gap-3 rounded-xl p-3 text-left text-base leading-6 font-medium text-ink-muted hover:bg-surface-sunken"
            >
              <SidebarIcon name="logout" />
              <span>{messages.auth.signOut}</span>
            </button>
          </form>
        </li>
      </ul>
    </div>
  );
}
