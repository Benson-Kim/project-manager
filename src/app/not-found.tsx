import Link from "next/link";
import { messages } from "@/lib/messages";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-4 text-center">
      <h1 className="text-xl font-semibold text-ink">{messages.app.notFoundTitle}</h1>
      <p className="text-sm text-ink-muted">{messages.app.notFoundBody}</p>
      <Link
        href="/"
        className="mt-2 inline-flex min-h-10 items-center rounded-md bg-accent px-6 text-sm font-medium text-on-accent"
      >
        {messages.app.goHome}
      </Link>
    </main>
  );
}
