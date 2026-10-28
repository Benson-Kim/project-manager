import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/lib/auth/provider";
import { messages } from "@/lib/messages";

export const metadata: Metadata = { title: messages.nav.boards };

/**
 * Honest placeholder (nav-items.ts): the boards module's data layer has landed
 * (migration 037, the board procs, contracts and actions), its views have not.
 * Replaced by the board list and board view (ADR-0038, slice B2).
 */
export default async function Page() {
  await auth.requireSession();
  return (
    <>
      <p className="text-sm text-ink-muted">{messages.app.moduleNotAvailable}</p>
      <Link
        href="/projects"
        className="mt-3 inline-flex min-h-10 items-center text-sm font-medium text-accent"
      >
        {messages.app.goToProjects}
      </Link>
    </>
  );
}
