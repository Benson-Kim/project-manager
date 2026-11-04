import { AppShell } from "@/components/shell/app-shell";
import type { ShellAlert } from "@/components/shell/header-actions";
import { DEFAULT_IDLE_TIMEOUT_MINUTES } from "@/lib/auth/idle-timeout";
import { auth } from "@/lib/auth/provider";
import { can } from "@/lib/auth/rbac";
import { formatDate } from "@/lib/format";
import { messages } from "@/lib/messages";
import { getUpcomingAlerts, type UpcomingAlert } from "@/lib/repositories/upcoming-alerts";
import { getUserPreference, type UserPreference } from "@/lib/repositories/user-preference";
import { IdleSignOut } from "@/modules/auth/components/idle-sign-out";
import { listProjectOptions } from "@/modules/projects/repository/projects";
import type { ProjectOption } from "@/components/shell/project-header";

/**
 * Server shell data (issue #28): session (username, projects:create) and the
 * upcoming to-do alerts for the header bell — RSC-fetched, per request.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.getSession();
  const canCreateProject = session ? can(session.role, "projects:create") : false;
  const canCreateDailyActivity = session ? can(session.role, "daily-activities:create") : false;
  const canCreateTodo = session ? can(session.role, "todo-items:create") : false;
  let upcoming: UpcomingAlert[] = [];
  let projectOptions: ProjectOption[] = [];
  let idleTimeoutMinutes = DEFAULT_IDLE_TIMEOUT_MINUTES;
  if (session) {
    let preference: UserPreference | null;
    [upcoming, projectOptions, preference] = await Promise.all([
      getUpcomingAlerts(session.userId).catch(() => []),
      listProjectOptions(session.userId).catch(() => []),
      getUserPreference(session.userId).catch(() => null),
    ]);
    idleTimeoutMinutes = preference?.idleTimeoutMinutes ?? DEFAULT_IDLE_TIMEOUT_MINUTES;
  }
  const alerts: ShellAlert[] = upcoming.map((alert) => ({
    id: alert.id,
    title: alert.title ?? messages.app.untitled,
    dueDate: formatDate(alert.dueDate),
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
      {session ? <IdleSignOut idleTimeoutMinutes={idleTimeoutMinutes} /> : null}
      {children}
    </AppShell>
  );
}
