import { messages } from "@/lib/messages";

/**
 * Navigation registry (STANDARDS §5.3, shell spec in issue #28). Order is the
 * product owner's: Dashboard, Projects, Daily activities, To-do lists,
 * Reports; Settings is pinned at the bottom of the sidebar. Items whose
 * module has not landed yet point at the planned route with an honest
 * placeholder page (owning issues: #19 daily activities, #20 to-do, #21
 * reports, #23 settings/admin).
 */
export interface NavItem {
  href: string;
  label: string;
}

export const navItems: NavItem[] = [
  { href: "/", label: messages.nav.dashboard },
  { href: "/projects", label: messages.nav.projects },
  { href: "/daily-activities", label: messages.nav.dailyActivities },
  { href: "/todo", label: messages.nav.todoLists },
  { href: "/reports", label: messages.nav.reports },
];

export const settingsNavItem: NavItem = { href: "/settings", label: messages.nav.settings };

/** Header page title for the current pathname (top-level routes from the nav registry). */
export function pageTitleFor(pathname: string): string {
  if (pathname === "/projects/new") return messages.projects.newProject;
  if (pathname === "/change-password") return messages.auth.changePasswordTitle;
  const all = [...navItems, settingsNavItem];
  const match = all.find(
    (item) =>
      pathname === item.href || (item.href !== "/" && pathname.startsWith(`${item.href}/`)),
  );
  return match?.label ?? messages.app.name;
}
