"use client";

import Link from "next/link";
import { messages } from "@/lib/messages";
import { logoutAction } from "@/modules/auth/actions";
import { navItems, settingsNavItem } from "./nav-items";
import { LogoMark, SidebarIcon } from "./shell-icons";
import { SidebarToggle } from "./sidebar-toggle";

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
      ? { href: "/daily-activities?id=new", label: messages.dailyActivities.newActivity }
      : null;
  }
  if (pathname === "/todo" || pathname.startsWith("/todo/")) {
    return permissions.canCreateTodo
      ? { href: "/todo?id=new", label: messages.todoItems.newTodoItem }
      : null;
  }
  return permissions.canCreateProject
    ? { href: "/projects/new", label: messages.projects.newProject }
    : null;
}

const navLinkClass = (current: boolean, centred: string) =>
  `flex items-center gap-3 rounded-xl p-3 text-base leading-6 font-medium ${centred}
   hover:bg-accent-soft hover:text-accent ${
     current ? "bg-surface text-accent" : "text-ink-muted hover:bg-surface-sunken"
   }`;

/** The desktop sidebar's collapse control; the mobile drawer has none. */
export interface SidebarRail {
  collapsed: boolean;
  toggle: () => void;
  controls: string;
}

/**
 * Sidebar body (shell spec, issue #28), shared by the desktop sidebar and the
 * mobile drawer: logo, context-aware create button, nav items, then Settings
 * and Logout pinned at the bottom.
 *
 * The create button is route-sensitive:
 * - `/daily-activities*` → "New activity"  (requires dailyActivities:create)
 * - `/todo*`             → "New to-do item" (requires todoItems:create)
 * - anything else        → "New project"    (requires projects:create)
 *
 * If the current user lacks the required permission the button is hidden.
 *
 * With `rail` (desktop only) it gains the collapse toggle; collapsed, only the
 * icons show and the names stay as screen-reader text and hover titles. The
 * `rail:` classes are added only then, because the drawer also sits under html.
 */
export function SidebarContent({
  canCreateProject,
  canCreateDailyActivity,
  canCreateTodo,
  pathname,
  onNavigate,
  rail,
}: {
  canCreateProject: boolean;
  canCreateDailyActivity: boolean;
  canCreateTodo: boolean;
  pathname: string;
  onNavigate?: () => void;
  rail?: SidebarRail;
}) {
  const createAction = getCreateAction(pathname, {
    canCreateProject,
    canCreateDailyActivity,
    canCreateTodo,
  });
  const label = rail ? "whitespace-nowrap rail:sr-only" : "";
  const centred = rail ? "rail:justify-center" : "";
  const titleOf = (name: string) => (rail?.collapsed ? name : undefined);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={`mb-4 flex items-center gap-1 ${rail ? "rail:flex-col" : ""}`}>
        <Link
          href="/"
          onClick={onNavigate}
          title={titleOf(messages.app.name)}
          className={`flex flex-1 items-center gap-2 px-3 py-4 ${rail ? "rail:flex-none" : ""}`}
        >
          <LogoMark />
          <span className={`text-sm font-semibold text-ink ${label}`}>{messages.app.name}</span>
        </Link>
        {rail ? (
          <SidebarToggle
            controls={rail.controls}
            collapsed={rail.collapsed}
            onToggle={rail.toggle}
          />
        ) : null}
      </div>
      {createAction ? (
        <Link
          href={createAction.href}
          onClick={onNavigate}
          title={titleOf(createAction.label)}
          data-testid={
            createAction.href === "/projects/new" ? "shell-new-project" : "shell-new-action"
          }
          className={`flex items-center gap-3 rounded-xl p-3 text-base leading-6 bg-accent text-on-accent hover:bg-accent-strong mb-2 ${centred}`}
        >
          <SidebarIcon name="add" />
          <span className={label}>{createAction.label}</span>
        </Link>
      ) : null}
      <ul data-testid="nav-primary" className="flex flex-1 flex-col gap-2 overflow-y-auto">
        {navItems.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={isCurrent(pathname, item.href) ? "page" : undefined}
              title={titleOf(item.label)}
              className={navLinkClass(isCurrent(pathname, item.href), centred)}
            >
              <SidebarIcon name={item.icon} />
              <span className={label}>{item.label}</span>
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
            title={titleOf(settingsNavItem.label)}
            className={navLinkClass(isCurrent(pathname, settingsNavItem.href), centred)}
          >
            <SidebarIcon name={settingsNavItem.icon} />
            <span className={label}>{settingsNavItem.label}</span>
          </Link>
        </li>
        <li>
          <form action={logoutAction}>
            <button
              type="submit"
              title={titleOf(messages.auth.signOut)}
              className={`flex w-full items-center gap-3 rounded-xl p-3 text-left text-base leading-6 font-medium text-ink-muted hover:bg-surface-sunken ${centred}`}
            >
              <SidebarIcon name="logout" />
              <span className={label}>{messages.auth.signOut}</span>
            </button>
          </form>
        </li>
      </ul>
    </div>
  );
}
