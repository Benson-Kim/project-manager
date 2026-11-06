import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { DEFAULT_IDLE_TIMEOUT_MINUTES } from "@/lib/auth/idle-timeout";
import { auth } from "@/lib/auth/provider";
import { messages } from "@/lib/messages";
import { getUserPreference } from "@/lib/repositories/user-preference";
import { IdleTimeoutSetting } from "@/modules/auth/components/idle-timeout-setting";
import { backupStatusFile } from "@/modules/backup/repository/backup-status";
import { DueSoonSetting } from "@/modules/todo-items/components/due-soon-setting";
import { DEFAULT_DUE_SOON_DAYS } from "@/modules/todo-items/schemas/todo-item";

export const metadata: Metadata = { title: messages.nav.settings };

/** The signed-in user's own settings, plus links to the shared templates. */
export default async function Page() {
  const session = await auth.requireSession();
  const preference = await getUserPreference(session.userId).catch(() => ({
    dueSoonDays: DEFAULT_DUE_SOON_DAYS,
    idleTimeoutMinutes: DEFAULT_IDLE_TIMEOUT_MINUTES,
  }));
  return (
    <>
      <PageHeader title={messages.nav.settings} />
      <section aria-labelledby="settings-todos" className="mb-6">
        <h2 id="settings-todos" className="mb-3 text-base font-semibold text-ink">
          {messages.settings.todos.title}
        </h2>
        <DueSoonSetting dueSoonDays={preference.dueSoonDays} />
      </section>
      <section aria-labelledby="settings-sign-in" className="mb-6">
        <h2 id="settings-sign-in" className="mb-3 text-base font-semibold text-ink">
          {messages.settings.signIn.title}
        </h2>
        <IdleTimeoutSetting idleTimeoutMinutes={preference.idleTimeoutMinutes} />
      </section>
      {session.role === "Admin" ? (
        <section aria-labelledby="settings-administration" className="mb-6">
          <h2 id="settings-administration" className="mb-3 text-base font-semibold text-ink">
            {messages.settings.administration}
          </h2>
          <Link
            href="/settings/users"
            data-testid="users-link"
            className="inline-flex min-h-10 items-center text-sm font-medium text-accent"
          >
            {messages.settings.users.title}
          </Link>
          <Link
            href="/settings/audit"
            data-testid="audit-link"
            className="ml-4 inline-flex min-h-10 items-center text-sm font-medium text-accent"
          >
            {messages.settings.audit.title}
          </Link>
          <Link
            href="/settings/link-rules"
            data-testid="link-rules-link"
            className="ml-4 inline-flex min-h-10 items-center text-sm font-medium text-accent"
          >
            {messages.settings.linkRules.title}
          </Link>
          {backupStatusFile() ? (
            <Link
              href="/settings/backup"
              data-testid="backup-link"
              className="ml-4 inline-flex min-h-10 items-center text-sm font-medium text-accent"
            >
              {messages.settings.backup.title}
            </Link>
          ) : null}
        </section>
      ) : null}
      <Link
        href="/settings/financial-templates"
        data-testid="financial-templates-link"
        className="mt-3 inline-flex min-h-10 items-center text-sm font-medium text-accent"
      >
        {messages.financials.templates.title}
      </Link>
      <Link
        href="/projects"
        className="mt-3 ml-4 inline-flex min-h-10 items-center text-sm font-medium text-accent"
      >
        {messages.app.goToProjects}
      </Link>
    </>
  );
}
