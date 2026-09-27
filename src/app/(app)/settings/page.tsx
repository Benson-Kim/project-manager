import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { auth } from "@/lib/auth/provider";
import { messages } from "@/lib/messages";

export const metadata: Metadata = { title: messages.nav.settings };

/** Honest placeholder (shell spec, issue #28) — replaced by module issue #23. */
export default async function Page() {
  await auth.requireSession();
  return (
    <>
      <PageHeader title={messages.nav.settings} />
      <p className="text-sm text-ink-muted">{messages.app.moduleNotAvailable}</p>
      <Link
        href="/projects"
        className="mt-3 inline-flex min-h-10 items-center text-sm font-medium text-accent underline"
      >
        {messages.app.goToProjects}
      </Link>
    </>
  );
}
