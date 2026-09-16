import { AppShell } from "@/components/shell/app-shell";
import type { ShellAlert } from "@/components/shell/header-actions";
import { auth } from "@/lib/auth/provider";
import { can } from "@/lib/auth/rbac";
import { messages } from "@/lib/messages";
import { getUpcomingAlerts } from "@/lib/repositories/upcoming-alerts";

/** Fixed locale — identical output on server and client (no hydration drift). */
const dateFormat = new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeZone: "UTC" });

/**
 * Server shell data (issue #28): session (username, projects:create) and the
 * upcoming to-do alerts for the header bell — RSC-fetched, per request.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.getSession();
  const canCreateProject = session ? can(session.role, "projects:create") : false;
  const upcoming = session ? await getUpcomingAlerts(session.userId).catch(() => []) : [];
  const alerts: ShellAlert[] = upcoming.map((alert) => ({
    id: alert.id,
    title: alert.title ?? messages.app.untitled,
    dueDate: dateFormat.format(alert.dueDate),
  }));

  return (
    <AppShell
      username={session?.username ?? ""}
      canCreateProject={canCreateProject}
      alerts={alerts}
    >
      {children}
    </AppShell>
  );
}
