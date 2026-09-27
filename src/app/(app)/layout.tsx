import { AppShell } from "@/components/shell/app-shell";
import type { ShellAlert } from "@/components/shell/header-actions";
import { auth } from "@/lib/auth/provider";
import { can } from "@/lib/auth/rbac";
import { messages } from "@/lib/messages";
import { getUpcomingAlerts, type UpcomingAlert } from "@/lib/repositories/upcoming-alerts";
import { listProjectOptions } from "@/modules/projects/repository/projects";
import type { ProjectOption } from "@/components/shell/project-header";

/** Fixed locale — identical output on server and client (no hydration drift). */
const dateFormat = new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeZone: "UTC" });

/**
 * Server shell data (issue #28): session (username, projects:create) and the
 * upcoming to-do alerts for the header bell — RSC-fetched, per request.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.getSession();
  const canCreateProject = session ? can(session.role, "projects:create") : false;
  const canCreateDailyActivity = session ? can(session.role, "daily-activities:create") : false;
  const canCreateTodo = session ? can(session.role, "todo-alerts:create") : false;
  let upcoming: UpcomingAlert[] = [];
  let projectOptions: ProjectOption[] = [];
  if (session) {
    [upcoming, projectOptions] = await Promise.all([
      getUpcomingAlerts(session.userId).catch(() => []),
      listProjectOptions(session.userId).catch(() => []),
    ]);
  }
  const alerts: ShellAlert[] = upcoming.map((alert) => ({
    id: alert.id,
    title: alert.title ?? messages.app.untitled,
    dueDate: dateFormat.format(alert.dueDate),
  }));

  return (
    <AppShell
      username={session?.username ?? ""}
      canCreateProject={canCreateProject}
      canCreateDailyActivity={canCreateDailyActivity}
      canCreateTodo={canCreateTodo}
      projectOptions={projectOptions}
      alerts={alerts}
    >
      {children}
    </AppShell>
  );
}
