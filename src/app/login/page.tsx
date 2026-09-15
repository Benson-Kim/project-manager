import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { messages } from "@/lib/messages";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: `${messages.auth.loginTitle} — ${messages.app.name}` };

/**
 * Full-route login page (ADR-0009 form pattern; module #4). Mobile-first:
 * a single centred column that works from 360px up.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const session = await auth();
  if (session?.appToken) redirect("/");

  const { reason } = await searchParams;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-4 py-8">
      <h1 className="text-xl font-semibold text-ink">{messages.auth.loginTitle}</h1>
      {reason === "expired" ? (
        <p
          role="status"
          className="rounded-md border border-accent bg-accent-soft p-3 text-sm text-ink"
        >
          {messages.auth.sessionExpired}
        </p>
      ) : null}
      <LoginForm />
    </main>
  );
}
